---
slug: "/mango-programming-language"
date: "2025-09-20"
title: "Building Mango: From Grammar to Interpreter, AOT Compiler, and VMs"
---

Mango is a small, experimental programming language I built to explore the full
journey of language implementation: syntax design, parsing into an AST, a
tree‑walking interpreter for fast iteration, followed by an ahead-of-time (AOT)
compiler that emits a compact bytecode format which can be executed by portable
virtual machines (implemented in Kotlin and Rust).

This post walks through the major steps, with code excerpts from the repository
and runnable examples.

- Language and AST design
- Parsing with a concise grammar
- Tree-walking interpreter (for validation and fast iteration)
- AOT compiler that emits bytecode (not a bytecode interpreter!)
- Linking and encoding
- Virtual Machines: Kotlin and Rust
- Running Mango code (interpreted and compiled)

Repository structure highlights:

- core: AST, parser, interpreter, compiler, and VMs
- compiler: CLI that compiles Mango source to bytecode (.mc)
- runtime: CLI that runs Mango either interpreted (.m) or as bytecode (.mc)
- examples: Example Mango programs (.m) and compiled outputs (.mc)

## 1) Language and AST design

Mango intentionally keeps the core small: integers, variables, function
definitions and calls, control flow (when/while/return), and
arithmetic/relational operators. The AST centers on a Program of top-level
functions.

Code: core/src/main/kotlin/lang/mango/parser/AST.kt

```kotlin
sealed interface AST {
    data class Program(val functions: List<Declaration.Function>): AST

    sealed interface Statement : AST

    sealed interface Declaration : Statement {
        data class Variable(val identifier: Identifier, val expression: Expression): Declaration
        data class Function(val identifier: Identifier, val arguments: List<Identifier>, val body: Block): Declaration
    }

    sealed interface Control : Statement {
        data class When(val expression: Expression, val body: Block) : Control
        data class While(val condition: Expression, val body: Block) : Control
        data class Return(val expression: Expression) : Control
    }

    data class Block(val statements: List<Statement>): Statement

    data class Assignment(val identifier: Identifier, val expression: Expression): Statement

    sealed interface Expression : Statement

    sealed interface Literal : Expression {
        data class Integer(val value: Int): Literal
    }

    data class UnaryOperation(val operator: String, val expression: Expression): Expression
    data class BinaryOperation(val left: Expression, val operator: String, val right: Expression): Expression
    data class FunctionCall(val identifier: Identifier, val arguments: List<Expression>): Expression
    data class Identifier(val name: String) : Expression
}
```

The AST keeps semantics straightforward, and each node maps naturally either to
interpreter behavior or emitted bytecode.

## 2) Parsing with a concise grammar

The grammar is expressed using better-parse combinators. It defines integer
literals, identifiers, function calls, arithmetic with precedence, control
statements, and function declarations.

Code: core/src/main/kotlin/lang/mango/parser/Grammar.kt

```kotlin
object Grammar : Grammar<AST.Program>() {
    val int by Tokens.number.use { AST.Literal.Integer(text.toInt()) }
    val identifier : Parser<AST.Identifier> by Tokens.identifier.use { AST.Identifier(text) }

    // function calls
    val argumentsList: Parser<List<AST.Expression>> = (
        parser { expression } and zeroOrMore(Tokens.comma and parser { expression })
    ).map { (first, rest) -> listOf(first) + rest.map { (_, e) -> e } }

    val functionCall: Parser<AST.Expression> = (
        identifier and skip(Tokens.leftParenthesis) and optional(argumentsList) and skip(Tokens.rightParenthesis)
    ).map { (id, args) -> AST.FunctionCall(id, args ?: emptyList()) }

    // precedence: term → mul/div/mod → add/sub → comparison
    val primary: Parser<AST.Expression> = (
        skip(Tokens.leftParenthesis) and parser { expression } and skip(Tokens.rightParenthesis)
    ) or functionCall or int or identifier

    val multiplyDivide: Parser<AST.Expression> = leftAssociative(primary, Tokens.multiply or Tokens.divide or Tokens.modulo) { l, op, r ->
        AST.BinaryOperation(l, op.type.name!!, r)
    }

    val plusMinus: Parser<AST.Expression> = leftAssociative(multiplyDivide, Tokens.plus or Tokens.minus) { l, op, r ->
        AST.BinaryOperation(l, op.type.name!!, r)
    }

    val comparison: Parser<AST.Expression> = leftAssociative(plusMinus, Tokens.notEqual or Tokens.doubleEqual or Tokens.lessThan or Tokens.lessThanOrEqual or Tokens.greaterThan or Tokens.greaterThanOrEqual) { l, op, r ->
        AST.BinaryOperation(l, op.type.name!!, r)
    }

    val expression: Parser<AST.Expression> = comparison

    // statements
    val assignment: Parser<AST.Assignment> = (
        identifier and skip(Tokens.equal) and parser { expression }
    ).map { (id, e) -> AST.Assignment(id, e) }

    val variableDeclaration: Parser<AST.Declaration> = (
        Tokens.let and assignment
    ).map { (_, a) -> AST.Declaration.Variable(a.identifier, a.expression) }

    val whenStatement: Parser<AST.Control.When> = (
        skip(Tokens.whenToken) and skip(Tokens.leftParenthesis) and expression and skip(Tokens.rightParenthesis) and parser { (block or statement) }
    ).map { (e, blkOrStmt) -> AST.Control.When(e, blkOrStmt as? AST.Block ?: AST.Block(listOf(blkOrStmt))) }

    val functionDeclaration: Parser<AST.Declaration.Function> = (
        skip(Tokens.fn) and identifier and skip(Tokens.leftParenthesis) and optional(parameterList) and skip(Tokens.rightParenthesis) and skip(zeroOrMore(Tokens.whitespace)) and parser { block }
    ).map { (id, params, blk) ->
        AST.Declaration.Function(id, params ?: emptyList(), blk).let { f ->
            if (f.body.statements.lastOrNull() !is AST.Control.Return) {
                f.copy(body = AST.Block(f.body.statements + AST.Control.Return(AST.Literal.Integer(0))))
            } else f
        }
    }

    val program = zeroOrMore(functionDeclaration).map { decls -> AST.Program(decls) }
    override val rootParser: Parser<AST.Program> = program
}
```

Parsing is wrapped in `MangoParser.parse`, which also validates against nested
function declarations:

```kotlin
object MangoParser {
    fun parse(input: String): AST.Program {
        return validate(Grammar.parseToEnd(input))
    }

    private fun validate(program: AST.Program): AST.Program {
        val visitor = NestedFunctionValidatorVisitor()
        visitor.visit(program)
        return program
    }
}
```

## 3) Tree‑walking interpreter

Before committing to a bytecode format, I built a simple interpreter to validate
semantics and iterate faster on language features. The interpreter executes the
AST directly.

Code: core/src/main/kotlin/lang/mango/interpreter/MangoInterpreter.kt

```kotlin
class MangoInterpreter(
    private val runtimeEnvironment: RuntimeEnvironment = RuntimeEnvironment()
) {
    fun interpret(program: AST.Program): Int {
        program(program)
        val mainCall = AST.FunctionCall(AST.Identifier("main"), emptyList())
        return functionCall(mainCall)
    }

    private fun functionCall(functionCall: AST.FunctionCall): Int {
        val function = runtimeEnvironment.getFunction(functionCall.identifier.name)
        val variables = function.arguments.mapIndexed { index, parameter ->
            parameter.name to expression(functionCall.arguments[index])
        }.toMap()

        runtimeEnvironment.pushFrame()
        variables.forEach { (name, value) -> runtimeEnvironment.setVariable(name, value) }
        try { block(function.body) } catch (e: ReturnException) {
            runtimeEnvironment.popFrame(); return e.value
        }
        runtimeEnvironment.popFrame(); return 0
    }

    // expressions and operations...
}
```

This made it easy to write small Mango programs and verify behavior without a
compilation step.

## 4) AOT compiler (not a bytecode interpreter)

Once the language behaved as expected under the interpreter, I wrote an AOT
compiler that lowers AST to a simple assembly-like IR (ASM), then links and
encodes to a dense bytecode. The key difference from a bytecode interpreter is:
we do not interpret opcodes directly from source; we compile ahead of time into
a binary format that can be shipped and executed by compatible VMs.

The compiler produces per-function chunks of annotated ASM instructions. Labels
are resolved by a linker before encoding to bytes.

Code: core/src/main/kotlin/lang/mango/compiler/ASM.kt

```kotlin
sealed interface ASM {
    sealed interface Load : ASM {
        data class Constant(val value: Int) : Load
        data class Relative(val offset: Int) : Load
        data class Label(val label: String) : Load
    }
    data class Store(val offset: Int) : ASM
    data class Pop(val count: Int) : ASM
    data object Jump : ASM
    data object JumpWhenZero : ASM
    data object Exit : ASM

    sealed interface Op : ASM { /* Add, Sub, Mul, Div, Mod, comparisons... */ }
    data class Annotated(val instruction: ASM, val labels: List<String> = emptyList(), val comment: String? = null)
    sealed interface Chunk {
        val instructions: List<Annotated>
        val name: String
        data class Function(val function: AST.Declaration.Function, override val instructions: List<Annotated>) : Chunk {
            override val name = function.identifier.name
        }
        data class Raw(override val name: String, override val instructions: List<Annotated>) : Chunk
    }
}
```

Code: core/src/main/kotlin/lang/mango/compiler/MangoCompiler.kt

```kotlin
object MangoCompiler {
    fun compile(program: AST.Program, bootstrap: Boolean = true): List<ASM.Chunk> {
        // Produces a bootstrap chunk (entry) + function chunks
        // Each function compiles blocks/statements/expressions into ASM
    }
}
```

The actual file implements expression lowering, call setup/teardown, and return
conventions via labels and stack operations.

### 4.1 Core of the AOT compiler: Bootstrap, Function compiler, and StackFrameDescriptor

The AOT compiler in Mango is intentionally small and explicit. It is centered
around three pieces that work together with a stack-based calling convention:

- BootstrapCompiler: Emits the program entry. It synthesizes a call to main()
  and sets a synthetic return label that leads to an Exit instruction.
  - It does not lower arbitrary expressions; it only builds the initial
    call-and-exit sequence.
- FunctionCompiler: Lowers blocks, statements, and expressions inside a function
  to ASM, following a strict stack discipline.
  - Return: evaluates the return expression, stores it to the return-value slot,
    then unwinds locals and jumps to the caller via the return address on the
    stack.
  - Variable declarations: evaluates the initializer and stores it into the
    function-local slot computed by the descriptor.
  - Control (When): evaluates the condition, pushes a return label, then emits
    JumpWhenZero; the VM consumes the label and the condition from the stack.
- StackFrameDescriptor: Describes how a function’s stack frame is laid out and
  helps compute relative offsets for loads/stores during lowering.
  - The descriptor models these logical slots: ReturnAddress, ReturnValue,
    Local(name) for parameters and local variables, and transient RuntimeValue
    entries used while evaluating expressions.

Calling convention and frame layout

- The VM is stack-based; all data and control flow operate via pushing and
  popping stack values.
- When emitting a call from the caller (AbstractCompiler.functionCall):
  1. Push an initial 0 for the callee’s ReturnValue slot.
  2. Push the callee’s return address label (resolved to an absolute address by
     the linker).
  3. Push each argument value. While arguments are being evaluated, an offset is
     passed into expression lowering so that any reads of caller locals
     (Load.Relative) account for the extra values already pushed on the stack.
  4. Push zero-initialized slots for any additional block-scoped locals required
     by the callee (computed from StackFrameDescriptor.localsSize).
  5. Push the callee function’s entry label, then Jump. The Jump pops the
     address and transfers control, leaving the whole new frame on top of the
     stack for the callee.
- Inside the callee:
  - Identifiers compile to Load.Relative(offset) where offset is provided by the
    StackFrameDescriptor for this function. The descriptor is constructed as:
    [ReturnValue, ReturnAddress, parameters, local variables], with RuntimeValue
    slots temporarily pushed/popped during expression evaluation.
  - Binary operations evaluate right, then left, pushing transient RuntimeValue
    slots in between; the arithmetic/compare op pops both operands and pushes
    the result.
- Returning from the callee:
  1. The return expression is evaluated; the result is stored to the ReturnValue
     slot (Store(offsetOf(ReturnValue))).
  2. Pop(localsSize) unwinds only the function’s locals (parameters + block
     locals), leaving ReturnAddress and ReturnValue at the top.
  3. Jump then pops ReturnAddress and transfers control back to the caller. The
     caller now finds the callee’s ReturnValue at the top of the stack for
     further use.

This explicit, minimal convention makes it easy to link and run on any compliant
stack VM.

## 5) Linking and encoding

Label resolution is handled by the linker, which computes instruction addresses
given encoder sizes (so it can replace label loads with absolute offsets). Then
the encoder turns ASM into raw bytes.

Code: core/src/main/kotlin/lang/mango/compiler/MangoLinker.kt

```kotlin
class MangoLinker(
    val encoder: Encoder
) {
    fun link(chunks: List<ASM.Chunk>): List<ASM> {
        val instructions = chunks.flatMap { chunk ->
            chunk.instructions.mapIndexed { index, annotated ->
                if (index == 0) annotated.copy(labels = listOf(chunk.name) + annotated.labels) else annotated
            }
        }
        val labelMap = mutableMapOf<String, Int>()
        var ip = 0
        instructions.forEach { annotated ->
            annotated.labels.forEach { label -> labelMap[label] = ip }
            ip += encoder.sizeOf(annotated.instruction)
        }
        return instructions.map { annotated ->
            when (val instruction = annotated.instruction) {
                is ASM.Load.Label -> ASM.Load.Constant(labelMap[instruction.label]!!)
                else -> instruction
            }
        }
    }
}
```

Code: core/src/main/kotlin/lang/mango/compiler/Encoder.kt

```kotlin
object ByteEncoder : Encoder {
    override fun sizeOf(asm: ASM): Int = when (asm) {
        is ASM.Load, is ASM.Store, is ASM.Pop -> 5
        else -> 1
    }

    fun encode(instructions: List<ASM>): ByteBuffer {
        val buffer = ByteBuffer.allocate(instructions.sumOf { sizeOf(it) })
        instructions.forEach { instruction -> encode(instruction, buffer) }
        return buffer
    }

    private fun encode(instruction: ASM, buffer: ByteBuffer) {
        when (instruction) {
            is ASM.Exit -> buffer.put(0x00)
            is ASM.Jump -> buffer.put(0x01)
            is ASM.JumpWhenZero -> buffer.put(0x02)
            is ASM.Load.Constant -> buffer.put(0x10).putInt(instruction.value)
            is ASM.Load.Relative -> buffer.put(0x11).putInt(instruction.offset)
            is ASM.Store -> buffer.put(0x20).putInt(instruction.offset)
            is ASM.Pop -> buffer.put(0x21).putInt(instruction.count)
            is ASM.Op.Add -> buffer.put(0x30)
            /* … other ops … */
        }
    }
}
```

## 6) Virtual Machines: Kotlin and Rust

I wrote two VMs that execute the compiled bytecode: one in Kotlin, one in Rust.
They implement the same instruction semantics as the ASM/encoder mapping.

Kotlin VM: core/src/main/kotlin/lang/mango/vm/ByteCodeVirtualMachine.kt

```kotlin
class ByteCodeVirtualMachine(
    val buffer: ByteArray
) {
    val stack = ArrayDeque<Int>()
    var ip = 0

    fun run() {
        while (ip < buffer.size) step()
    }

    fun step() {
        if (ip >= buffer.size) return
        handle(buffer[ip])
    }

    private fun handle(byte: Byte) {
        ip++
        when (byte.toInt()) {
            0x00 -> ip = buffer.size                  // Exit
            0x01 -> ip = pop()                        // Jump
            0x02 -> { val a = pop(); if (pop() == 0) ip = a } // JumpWhenZero
            0x10 -> { stack.addFirst(ByteBuffer.wrap(buffer, ip, 4).int); ip += 4 } // Load.Const
            0x11 -> { val o = ByteBuffer.wrap(buffer, ip, 4).int; stack.addFirst(stack[o]); ip += 4 } // Load.Relative
            0x20 -> { val o = ByteBuffer.wrap(buffer, ip, 4).int; val v = pop(); stack[o] = v; ip += 4 } // Store
            0x21 -> { repeat(ByteBuffer.wrap(buffer, ip, 4).int) { pop() }; ip += 4 } // Pop
            in 0x30..0x34 -> { /* arithmetic ops */ }
            in 0x40..0x44 -> { /* comparison ops */ }
            else -> error("Unknown operation: $byte")
        }
    }

    private fun pop() = stack.removeFirst()
}
```

Rust VM: rust-vm/src/vm.rs (excerpt)

```rust
pub struct VM {
    pub stack: Vec<i32>,
    pub ip: usize,
    pub buffer: Vec<u8>,
}

impl VM {
    pub fn run(&mut self) {
        while self.ip < self.buffer.len() {
            self.step();
        }
    }

    pub fn step(&mut self) {
        // decode and execute opcodes similarly to Kotlin VM
    }
}
```

Additionally, there is an ASM-level VM that runs the IR directly (useful for
debugging before encoding):
core/src/main/kotlin/lang/mango/vm/ASMVirtualMachine.kt.

## 7) Running Mango code

You can either interpret source code directly (great for quick iteration) or
compile it to bytecode and run it on a VM, which mirrors real-world distribution
of precompiled artifacts.

Example program: examples/fibonacci.m

```mango
fn fib(n) {
    when (n == 0) return 0
    when (n == 1) return 1
    return fib(n - 1) + fib(n - 2)
}

fn main() {
    return fib(30)
}
```

- Interpret the source (runtime module detects .m):

```bash
./gradlew :runtime:installDist
./runtime/build/install/runtime/bin/runtime examples/fibonacci.m
```

- Compile AOT to bytecode (.mc):

```bash
./gradlew :compiler:installDist
./compiler/build/install/compiler/bin/compiler examples/fibonacci.m examples/fibonacci.mc
```

- Run the compiled bytecode with the Kotlin VM (runtime also detects .mc):

```bash
./runtime/build/install/runtime/bin/runtime examples/fibonacci.mc
```

Under the hood, the runtime decides based on file extension:

Code: runtime/src/main/kotlin/lang/mango/Runtime.kt

```kotlin
fun main(args: Array<String>) {
    require(args.size == 1) { "Usage: mango <compiled file or interpreted file>" }
    val sourceFile = File(args[0])

    if (sourceFile.extension == "mc") {
        val vm = ByteCodeVirtualMachine(sourceFile.readBytes())
        vm.run()
        println(vm.stack.first())
        return
    } else {
        val ast = MangoParser.parse(sourceFile.readText())
        val result = MangoInterpreter().interpret(ast)
        println(result)
    }
}
```

## Why AOT instead of a bytecode interpreter?

- Tree-walking interpreter: executes AST nodes directly. Simple, great for
  development, but slower.
- Bytecode interpreter (classic): interprets a fixed instruction set emitted by
  a just-in-time or immediate compiler; still interprets at runtime but requires
  runtime translation.
- AOT compiler (Mango’s approach): emits a final portable bytecode ahead of
  time; the program can be shared and executed on any compatible VM without the
  source or parser. This separation enables multiple independent VM
  implementations (e.g., Kotlin and Rust in this repo) while guaranteeing
  consistent semantics.

## Closing thoughts

Mango is intentionally minimal yet end-to-end: grammar → AST → interpreter → ASM
→ linker/encoder → bytecode → VMs. This pipeline made it easy to validate the
language quickly and then lock down a portable format others can run in their
own VM implementations.

Have ideas or questions? Try the examples, extend the grammar, or implement a
new VM for the bytecode in your favorite language!

You can find the code here: https://github.com/helico-tech/mango
