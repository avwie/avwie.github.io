---
slug: "/pure-kotlin-postgres-client"
date: "2025-09-27"
title: "Building a PostgreSQL client in pure Kotlin (with coroutines)"
---

I’ve always loved those projects that force you to peel back abstractions and
work with the raw metal. This one started as a weekend curiosity: could I speak
the PostgreSQL wire protocol directly from Kotlin, without JDBC, without libpq,
and make it work across JVM, JS, Wasm, and Native? Just sockets, bytes, and
coroutines.

The result is a tiny, composable client that implements the
startup/authenticator, the simple query flow, a slice of the extended query
protocol (Parse/Bind/Execute), and LISTEN/NOTIFY. This post is a
behind‑the‑scenes walkthrough of how it’s built, how the protocol is framed, and
how coroutines glue it all together.

## Table of contents

- [Why build this?](#why-build-this)
- [The public API](#the-public-api)
- [Framing messages: bytes on the wire](#framing-messages-bytes-on-the-wire)
- [The registry: mapping types to serializers/deserializers](#the-registry-mapping-types-to-serializersdeserializers)
- [Startup and authentication](#startup-and-authentication)
- [Simple queries vs. extended protocol](#simple-queries-vs-extended-protocol)
- [Running a query with coroutines](#running-a-query-with-coroutines)
- [Error handling](#error-handling)
- [Multiplatform notes](#multiplatform-notes)
- [Using the client](#using-the-client)
- [Gotchas and lessons](#gotchas-and-lessons)
- [What’s next](#whats-next)
- [Closing thoughts](#closing-thoughts)

## Why build this?

- Control: Build only what I need, understand every message on the wire.
- Multiplatform: Kotlin MPP + Ktor sockets gets me JVM, JS, Wasm, and Native.
- Learning: Authentication (MD5/SASL), framing, backpressure, and state machines
  are fun problems.

## The public API

I wanted an API that felt small and async‑friendly:

- connect / disconnect
- query("…") — the simple query protocol
- prepare("…") + execute(values) — extended protocol
- listen(channel) and notify(channel, payload)

From the code:

```kotlin
interface Client {
    val isConnected: Boolean

    suspend fun connect()
    suspend fun disconnect()

    suspend fun query(queryString: String): QueryResult

    suspend fun prepare(queryString: String): PreparedStatement

    suspend fun execute(
        preparedStatement: PreparedStatement,
        values: List<String?> = emptyList(),
    ): QueryResult

    suspend fun listen(channel: String): Flow<NotificationResponse>

    suspend fun notify(
        channel: String,
        payload: String,
    )

    companion object {
        operator fun invoke(connectionParameters: ConnectionParameters): Client = DefaultClient(connectionParameters)
    }
}
```

That’s it. Everything else is protocol plumbing.

## Framing messages: bytes on the wire

PostgreSQL’s protocol is a stream of framed messages. Most backend messages
start with a one‑byte type tag (e.g., 'R' for Authentication, 'E' for Error, 'A'
for Notification), followed by a 4‑byte length that includes the length field
itself, followed by the payload. Some frontend messages omit the type byte
(notably the initial StartupMessage).

To make that ergonomic I keep a tiny set of helpers around a Buffer that can
write null‑terminated strings and auto‑size frames:

```kotlin
fun Sink.writeNullByte() {
    writeByte(0)
}

fun Sink.writeCString(text: String) {
    writeString(text)
    writeNullByte()
}

fun Source.readCString(): String {
    val buffer = Buffer()
    var byte = readByte()
    while (byte != 0.toByte()) {
        buffer.writeByte(byte)
        byte = readByte()
    }
    return buffer.readString(buffer.size)
}

fun Buffer.writeSized(
    type: Char? = null,
    body: Buffer.() -> Unit,
) {
    val packet = buffered(body)
    val size = packet.size.toInt() + Int.SIZE_BYTES

    if (type != null) writeByte(type.code.toByte())

    writeInt(size)
    writePacket(packet)
}
```

With that, serializing a frontend frame is just `writeSized('X') { … }`.

## The registry: mapping types to serializers/deserializers

I didn’t want a big switch statement sprinkled throughout the code. Instead, the
message layer is built around a registry that maps Kotlin types to serializers,
and backend type chars to deserializers:

```kotlin
class MessageRegistry(
    val serializers: Serializers,
    val deserializers: Deserializers,
) {
    fun deserialize(
        type: Char,
        buffer: Buffer,
    ): BackendMessage = deserializers[type]?.deserialize(type, buffer) ?: Deserializer.Unhandled.deserialize(type, buffer)

    @Suppress("UNCHECKED_CAST")
    fun <T : FrontendMessage> serialize(message: T): Buffer =
        (serializers[message::class] as? Serializer<T>)?.serialize(message)
            ?: throw NoSuchElementException("No serializer for message type '${message::class}'.")

    companion object {
        operator fun invoke(body: Builder.() -> Unit): MessageRegistry = Builder().apply(body).build()
    }

    class Builder {
        private val serializers = mutableMapOf<KClass<out FrontendMessage>, Serializer<FrontendMessage>>()
        private val deserializers = mutableMapOf<Char, Deserializer<out BackendMessage>>()

        fun backend(
            type: Char,
            deserializer: Deserializer<out BackendMessage>,
        ) {
            deserializers[type] = deserializer
        }

        inline fun <reified T : BackendMessage> backend(
            type: Char,
            crossinline body: Buffer.(Char) -> T,
        ) = backend(
            type,
            Deserializer { type, buffer ->
                body(buffer, type)
            },
        )

        inline fun <reified T : FrontendMessage> frontend(crossinline body: Buffer.(T) -> Unit) =
            frontend(
                T::class,
                Serializer { message -> Buffer().apply { body(message as T) } },
            )

        fun build(): MessageRegistry = MessageRegistry(serializers, deserializers)
    }
}
```

At startup I register a small set of message families:

```kotlin
val DefaultMessageRegistry =
    MessageRegistry {
        commonResponses()
        parameterStatus()
        backendKeyData()

        startupMessage()
        authentication()
        query()
        terminate()
    }
```

## Startup and authentication

The first frame the client sends is a StartupMessage with protocol version and
parameters (like user, database). It’s one of the few frontend messages with no
leading type byte:

```kotlin
data class StartupMessage(
    val protocolMajorVersion: Int = 3,
    val protocolMinorVersion: Int = 0,
    val parameters: Map<String, String>,
) : FrontendMessage

fun MessageRegistry.Builder.startupMessage() {
    frontend<StartupMessage> { message ->
        writeSized {
            writeInt(message.protocolMajorVersion shl Short.SIZE_BITS or message.protocolMinorVersion)
            message.parameters.forEach { (key, value) ->
                writeCString(key)
                writeCString(value)
            }
            writeNullByte()
        }
    }
}
```

The server then replies with an authentication request. The client supports:

- AuthenticationMD5 — the classic two‑step MD5 over password+username and salt.
- SASL (SCRAM) — mechanism negotiation, initial response, challenge/response,
  final verification. The repo includes the message plumbing for SASL and a tiny
  session surface; the SCRAM helper itself lives in messages/Scram.kt.

MD5 ends up being a neat bite‑sized example of “do exactly what the protocol
specifies”:

```kotlin
data class PasswordMessage(
    val password: String,
) : FrontendMessage {
    companion object {
        suspend fun md5(
            username: String,
            password: String,
            salt: ByteArray,
        ): PasswordMessage {
            // First MD5: md5(password + username) - convert to hex string
            val firstHash =
                Digest("MD5").let { digest ->
                    digest += password.toByteArray()
                    digest += username.toByteArray()
                    digest.build().toHexString()
                }

            // Second MD5: md5(firstHashHex + salt) - convert to hex string
            val secondHash =
                Digest("MD5").let { digest ->
                    digest += firstHash.toByteArray()
                    digest += salt
                    digest.build().toHexString()
                }

            return PasswordMessage("md5$secondHash")
        }
    }
}
```

On the receiving side, a single deserializer handles the whole Authentication
family from the backend:

```kotlin
backend('R') { type ->
    when (readInt()) {
        0 -> AuthenticationOk
        5 -> AuthenticationMD5(readByteArray())
        10 -> {
            val mechs = mutableListOf<String>()
            while (true) {
                val mech = readCString()
                if (mech.isEmpty()) break
                mechs.add(mech)
            }
            AuthenticationSASL(mechs)
        }
        11 -> AuthenticationSASLContinue(readString(size))
        12 -> AuthenticationSASLFinal(readString(size))
        else -> BackendMessage.Unhandled(type, this)
    }
}
```

## Simple queries vs. extended protocol

Postgres has two main flows:

1. Simple query protocol: A single 'Q' message with the SQL string. Rows stream
   back as RowDescription + DataRow… + CommandComplete + ReadyForQuery.
2. Extended query protocol: Parse a statement, Bind parameters, Execute a
   portal, optionally Describe/Close. This gives you prepared statements and
   typed parameters.

I mapped these to message types like Query, Parse, Bind, Execute,
RowDescription, DataRow, CommandComplete, ReadyForQuery, with compact
serializers/deserializers. For example, DataRow is just a list of nullable byte
buffers (each field can be null or a payload):

```kotlin
class DataRow(val fields: List<Buffer?>) : BackendMessage
```

The Builder for the query family wires up all the frames and their shapes in one
place (shortened here for readability):

```kotlin
fun MessageRegistry.Builder.query() {
    // Backend
    backend<ReadyForQuery>('Z') { _ -> ReadyForQuery(readByte().toInt().toChar()) }
    backend<RowDescription>('T') { _ ->
        val fields = (0 until readShort().toInt()).map {
            RowDescription.Field(
                field = readCString(),
                tableOid = readInt(),
                columnAttributeNumber = readShort(),
                fieldOid = readInt(),
                dataTypeSize = readShort(),
                typeModifier = readInt(),
                formatCode = readShort(),
            )
        }
        RowDescription(fields)
    }
    backend<ParameterDescription>('t') { _ ->
        val params = (0 until readShort().toInt()).map { readInt() }
        ParameterDescription(params)
    }
    backend<DataRow>('D') { _ ->
        val columns = readShort().toInt()
        val values = (0 until columns).map {
            val size = readInt()
            if (size == -1) null else Buffer().also { buf -> buf.write(readByteArray(size)) }
        }
        DataRow(values)
    }
    backend<CommandComplete>('C') { _ -> CommandComplete(readCString()) }

    // Frontend
    frontend<Query> { message -> writeSized('Q') { writeCString(message.query) } }
    frontend<Parse> { (name, sql) -> writeSized('P') {
        writeCString(name)
        writeCString(sql)
        writeShort(0) // no explicit type hints
    } }
    frontend<Describe> { (type, name) -> writeSized('D') { writeByte(type.code.toByte()); writeCString(name) } }
    frontend<Bind> { (portal, statement, values) -> writeSized('B') {
        writeCString(portal)
        writeCString(statement)
        writeShort(0) // no format codes
        writeShort(values.size)
        values.forEach { v ->
            if (v == null) writeInt(-1) else {
                val bytes = v.toByteArray()
                writeInt(bytes.size)
                write(bytes)
            }
        }
        writeShort(0) // result format codes
    } }
    frontend<Execute> { (portal) -> writeSized('E') { writeCString(portal); writeInt(0) } }
    frontend<Close> { (type, name) -> writeSized('X') { writeByte(type.code.toByte()); writeCString(name) } }
}
```

## Running a query with coroutines

The high‑level DefaultClient is a small coroutine‑driven state machine. It’s
responsible for:

- Owning the socket and read/write channels (via Ktor’s low‑level sockets on
  each platform).
- Serializing frontend messages with the MessageRegistry.
- Parsing backend frames as they stream in.
- Coordinating “who is waiting for what” using channels and a sealed State.

A simplified sketch of the control flow:

```kotlin
class DefaultClient(
    val connectionParameters: ConnectionParameters,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.Default + CoroutineName("PostgresClient")),
    private val messageRegistry: MessageRegistry = DefaultMessageRegistry,
) : Client {
    // …

    private suspend fun send(message: FrontendMessage) {
        val buffer = messageRegistry.serialize(message)
        socketOutput.writeFully(buffer.readByteArray())
        socketOutput.flush()
    }

    private suspend fun receive(): BackendMessage {
        val type = input.readByte().toInt().toChar() // 'R', 'T', 'D', …
        val size = input.readInt() - Int.SIZE_BYTES
        val payload = Buffer().also { it.writeFully(input.readByteArray(size)) }
        return messageRegistry.deserialize(type, payload)
    }

    private fun transition(newState: State) { state = newState }

    private sealed interface State {
        data class Collecting(val resultChannel: Channel<DataRow>) : State
        data class Listening(val resultChannel: Channel<NotificationResponse>) : State
    }
}
```

When you call `query("select 42")`, the client sends a Query message, then flips
into a Collecting state. As DataRow messages arrive, it pushes them into a
Channel. When CommandComplete and ReadyForQuery arrive, it closes the channel
and returns a QueryResult built from the streamed rows.

LISTEN/NOTIFY is the same pattern with a different state: emit
NotificationResponse values into a Flow.

## Error handling

Errors come as ErrorResponse frames ('E'). I deserialize them into a list of
fields (type code + value) and surface them as exceptions at the right time.
Because everything rides on channels, it’s easy to propagate failure to the
caller awaiting a result without killing the long‑lived connection.

```kotlin
fun MessageRegistry.Builder.commonResponses() {
    backend('A') {
        NotificationResponse(readInt(), readCString(), readCString())
    }

    backend('E') {
        var fields = mutableListOf<ErrorResponse.Field>()
        while (peek().readByte() != 0.toByte()) {
            fields.add(ErrorResponse.Field(readByte().toInt().toChar(), readCString()))
        }
        ErrorResponse(fields)
    }

    frontend<Sync> {
        writeSized('C') {}
    }
}
```

## Multiplatform notes

- Sockets: Ktor’s low‑level sockets are used where available; the higher layers
  (messages, state) are pure Kotlin.
- Concurrency: kotlinx.coroutines is the common concurrency story across
  targets. The client spins reader/writer loops in coroutines and coordinates
  via Channel and Flow.
- Types: For row values I intentionally keep fields as Buffer? at the protocol
  edge. Turning them into Kotlin types is a separate concern and keeps the wire
  layer minimal.

## Using the client

A few end‑to‑end uses:

### Simple query

```kotlin
val client = Client(
    ConnectionParameters(host = "localhost", port = 5432, database = "postgres", user = "postgres", password = "postgres")
)

runBlocking {
    client.connect()
    val (metadata, data) = client.query("select 1 as one, 'hello' as msg")
    data.collect { row -> println(row) } // collects as flow
    client.disconnect()
}
```

### Prepared statement

```kotlin
runBlocking {
    client.connect()
    val stmt = client.prepare("select $1::int + $2::int")
    val (metadata, data) = client.execute(stmt, listOf("2", "40"))
    data.collect { row -> println(row) } // collects as flow
    client.disconnect()
}
```

### LISTEN/NOTIFY

```kotlin
runBlocking {
    client.connect()
    val flow = client.listen("news")
    val job = launch {
        flow.collect { println("notify from ${it.backendPID} on ${it.channel}: ${it.payload}") }
    }

    client.notify("news", "hi there")
    delay(1000)
    job.cancel()
    client.disconnect()
}
```

## Gotchas and lessons

- Length fields include themselves: When framing, the 4‑byte size includes the
  size field; the helpers above account for that.
- Startup has no type byte: Don’t accidentally write it for the first message.
- MD5 hashes are hex strings, then prefixed with "md5": It’s easy to get the
  order wrong; tests against a real server help.
- Backpressure is natural with Channel: Streaming rows into a Channel lets your
  consumer control pace.
- Keep the wire layer dumb: Resist the urge to parse every field into domain
  types at this layer. It keeps the client tiny and portable.

## Closing thoughts

There’s something deeply satisfying about seeing ReadyForQuery roll in after you
negotiate auth and push a few frames. Kotlin MPP and coroutines make it
practical to build the whole thing once and ship to multiple runtimes. If you’ve
been curious about wire protocols, PostgreSQL’s is a great place to learn: well
documented, forgiving to experiment with, and immediately rewarding.

If you want to explore further, the code is split cleanly into messages
(serializers/deserializers), the client state machine, and tiny data models for
rows and statements. Happy hacking!

You can find the finished project here:
https://github.com/helico-tech/postgreskt
