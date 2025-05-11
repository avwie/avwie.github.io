---
slug: "/web-components-in-kotlin-addendum"
date: "2025-05-11"
title: "Addendum on Creating Web Components in Kotlin and Compose HTML"
pageScripts:
  - src: "/scripts/web-components/compose-web-components.js"
---

After finalizing my last blog I started experimenting some more and came to the conclusion that there are some cool examples
I could still share.

So here we go!

## Composeception

After establishing we could create a web component from a Compose HTML composable function, I decided to create 
a specific Composable which wraps this web-component again.

No you might wonder.... why? You can just use the composable making up the web-component directly. And you would be right.
However, I wanted to explicitly show the composable nature of the web-component, and its encapsulation.

### Creating a Composable function of our web component

First we add a convenience function to our `EventDescriptor` in order to extract the payloads:
```kotlin
data class EventDescriptor<T>(val name: String, val bubbles: Boolean = true, val cancellable: Boolean? = null, val composed: Boolean = true) {
    fun extract(event: SyntheticEvent<org.w3c.dom.HTMLElement>): T {
        @Suppress("UNCHECKED_CAST")
        return extract(event.nativeEvent as CustomEvent<T>)
    }

    fun extract(event: CustomEvent<T>): T {
        return event.detail
    }
}
```

And we add two extensions on the `AttrScope`:
```kotlin
fun <D> AttrsScope<*>.listen(eventDescriptor: WebComponent.EventDescriptor<D>, listener: (D) -> Unit) {
    addEventListener(eventDescriptor.name) {
        listener(eventDescriptor.extract(it))
    }
}

fun <T> AttrsScope<*>.attr(observedAttribute: WebComponent.ObservedAttribute<T>, value: T) {
    attr(observedAttribute.name, value.toString())
}
```

And now we can create a timer composable:

```kotlin
@Composable fun Timer(
    time: Int,
    onTimerStarted: ((Int) -> Unit)? = null,
    onTimerEnded: ((Int) -> Unit)? = null,
) {
    TagElement<HTMLElement>(
        tagName = TimerWebComponent.Factory.tagName,
        applyAttrs = {
            attr(Time, time)

            if (onTimerStarted != null) listen(TimerStarted, onTimerStarted)
            if (onTimerEnded != null) listen(TimerEnded, onTimerEnded)
        },
        content = {}
    )
}
```

By including them all in a new component:

```kotlin
@OptIn(ExperimentalJsExport::class)
@JsExport
@JsName("MultipleTimersComponent")
class MultipleTimersComponent : ComposedWebComponent(Factory) {

    object Factory : WebComponent.Factory<MultipleTimersComponent>(
        tagName = "multiple-timers",
        clazz = MultipleTimersComponent::class.js,
    )

    @Composable
    override fun render() {
        H1 {
            Text("Multiple timers")
            Timer(
                time = 10,
                onTimerStarted = { println("Timer started: $it") },
                onTimerEnded = { println("Timer ended: $it") },
            )
            Hr()
            Timer(20)
            Hr()
            Timer(30)
            Hr()
            Timer(40)
        }
    }
}
```

And we include it using the `<multiple-timers>` tag:

<multiple-timers></multiple-timers>

### Having web components depend on each other and being idempotent

Now we have dependencies between the components, so we need to make sure the components are registered properly.
Also, in SPA environments, it can be possible that the `register()` method is called multiple times, so we need to account for that.

```kotlin
abstract class Factory<T : HTMLElement>(
    val tagName: String,
    val clazz: CustomElementConstructor<T>,
    val attributes: List<ObservedAttribute<*>> = emptyList(),
    val styleSheet: StyleSheet? = null,
    val dependencies: List<Factory<*>> = emptyList(),
) {

    fun register() {
        dependencies.forEach { it.register() }

        val tag = HtmlTagName<T>(tagName)
        if (customElements.get(tag) != null) {
            console.warn("Custom element '$tag' already registered!")
            return
        }

        clazz.asDynamic().observedAttributes = attributes.map { it.name }.toTypedArray()
        customElements.define(tag, clazz)
    }
 }
```

## Using the Kotlinx HTML DSL for a Web Component

Using the `WebComponent` base it is trivial to add a web component based on the Kotlinx HTML DSL (https://github.com/Kotlin/kotlinx.html):

```kotlin
abstract class HtmlDslWebComponent(
    factory: Factory<out WebComponent>,
    mode: ShadowRootMode = ShadowRootMode.closed,
    observedAttributes: ObservedAttributes = ObservedAttributes(factory.attributes),
    rootElementTagName: String = "main",
) : WebComponent(factory, mode, observedAttributes, rootElementTagName) {
    override fun connectedCallback() {
        redraw()
    }

    fun redraw() {
        root.innerHTML = ""
        (root as HTMLElement).append {
            render()
        }
    }

    abstract fun TagConsumer<HTMLElement>.render()
}
```

And we can use it like this:

```kotlin
@OptIn(ExperimentalJsExport::class)
@JsExport
@JsName("PingPongComponent")
class PingPongComponent : HtmlDslWebComponent(factory = Factory) {

    object Factory : WebComponent.Factory<PingPongComponent>(
        tagName = "ping-pong",
        clazz = PingPongComponent::class.js,
    )

    private var pingOrPong = "ping"

    override fun TagConsumer<HTMLElement>.render() {
        h1 {
            +pingOrPong
        }

        button {
            + "Clicky"

            onClickFunction = {
                pingOrPong = if (pingOrPong == "ping") "pong" else "ping"
                redraw()
            }
        }
    }
}
```

And by including the `ping-pong` tag we have it working as well:

<ping-pong></ping-pong>

## Conclusion

I felt this addendum was a good opportunity to showcase some more of the capabilities of web components in Kotlin.

Hope you enjoyed it!
