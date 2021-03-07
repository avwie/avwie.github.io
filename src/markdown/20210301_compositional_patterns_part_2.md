---
slug: "/compositional-patterns-in-kotlin-part-2-component-model"
date: "2021-03-06"
title: "Compositional Patterns in Kotlin Part 2 - Component Model"
hero: "../images/20210301_compositional_patterns_part_2/hero.jpg"
---
This is the second part of the post on compositional patterns in Kotlin and will focus on a dynamic, or runtime, composition. There are a few ways to obtain dynamic composition, all with their own advantages and drawbacks.

## Component Model

It is very difficult to find a formal definition on the component model we use. If you search for Component Based Architecture, Component Architecture, Component Design, Entity Components, etc, you get a wide range of subjects, which all overlap. The one I am writing about here is very simple. It resembled the Entity Component Model, known in Unity, best. Please note that this means that it is just a 'small step' towards an Entity Component System, which is similar, but is a completely different way of looking at entities and components.

Roughly speaking, the Component Model is a model in which it is possible to add Components to an existing instance of a class during runtime.

Let's elaborate with an example.

## Components using Reflection

One of the possibilities of the JVM, and therefore Kotlin as well, when compiled to the JVM, is that it is possible to use reflection. Using reflection it is quite trivial to implement a dynamic component system. Let us first define some component:

```kotlin
interface Component

class Health(initialAmount: Int) : Component {
    var currentHealth = initialAmount
        private set

    val isDead: Boolean get() = currentHealth <= 0

    fun damage(amount: Int) {
        currentHealth -= amount
    }
}

class Dynamics(
    val mass: Double,
    sx0: Double,
    sy0: Double,
    vx0: Double = 0.0,
    vy0: Double = 0.0,
    ax0: Double = 0.0,
    ay0: Double = 0.0
) : Component {
    var position = sx0 to sy0
        private set

    var velocity = vx0 to vy0
        private set

    var acceleration = ax0 to ay0
        private set

    fun applyForce(amount: Pair<Double, Double>) {
        val (ax, ay) = acceleration
        val (fx, fy) = amount
        acceleration = ax + fx / mass to ay + fy / mass
    }

    fun updateDynamics(dt: Double) {
        val (ax, ay) = acceleration
        val (vx, vy) = velocity
        val (sx, sy) = position

        // this is clearly naive, since this is not deterministic, however... it serves the purpose for this post
        velocity = vx + ax * dt to vy + ay * dt
        position = sx + vx * dt to sy + vy * dt
    }
}
```

The components are almost identical to the ones in Part 1, with the exception that they all extend the `Component` interface.

It is now possible to define an interface for the way we want to set and retrieve components at runtime.

```kotlin
interface ComponentHolder {
    fun setComponent(component: Component)
    fun <C : Component> getComponent(type: KClass<C>): C?
}
```
What this interface gives us is a very simple way to set and retrieve a component. For the `getComponent` function we fetch the component by getting the `KClass` of the component type and enforcing that this can only be a `KClass` of type `C` which must implement `Component` via the typebound `C: Component`.

We can now have every class implement this interface when we require dynamic component behavior, but maybe it is better to once more use delegation again to define a reference implementation and delegate this behavior to that reference implementation.

```kotlin
class MapComponentHolder : ComponentHolder {
    private val components = mutableMapOf<KClass<out Component>, Component>()

    override fun setComponent(component: Component) {
        components[component::class] = component
    }

    @Suppress("UNCHECKED_CAST")
    override fun <C : Component> getComponent(type: KClass<C>): C? {
        return components[type] as? C
    }
}
```

We create a `MapComponentHolder` which implements the `ComponentHolder` interface by storing the `KClass` of any component we save using `setComponent`, using the `::class` notation, in a map. In the retrieval phase you see that we can easily retrieve this component _and_ cast it to the right type `C`. Please note that we had to add the annotation `@Suppress("UNCHECKED_CAST")` to the function because the Kotlin compiler is unsure if the result from fetching the `KClass<C>` from the map is actually castable to `C`, since the only thing the compiler knows about it is that it will return a value of type `Component`, and not `C`. However, we can be pretty sure that it is `C` and therefore can cast it using the `as?` keyword. This means it will return `null` when it is not castable and `C` when succesful.

Now we can use the delegation pattern again and mixin this implementation in an already existing class. I have a class called `Entity` with only 1 parameter, `id`, as an illustration purpose.

```kotlin
class Entity(val id: Long, private val components: ComponentHolder = MapComponentHolder()) :
    ComponentHolder by components
    
// test code
val player = Entity(Random.nextLong())
player.setComponent(Health(100))
player.setComponent(Dynamics(100.0, 5.0, 2.0))

assertEquals(100, player.getComponent(Health::class)?.currentHealth)
assertEquals(5.0 to 2.0, player.getComponent(Dynamics::class)?.position)
```

And as can be seen, we have dynamic, typesafe, compositional behavior. However, personally I don't really like the way I have to sprinkle `::class` through my code (but that is purely personal), so we can improve it, a tiny bit, by creating an extension function:
```kotlin
inline fun <reified C : Component> ComponentHolder.getComponent(): C? {
    return getComponent(C::class)
}

// test code
assertEquals(100, player.getComponent<Health>()?.currentHealth)
```

We use the fact that we can 'reify' type parameters in Kotlin in inline functions. Due to type erasure in the JVM this is normally not possible, however using `reified` we basically let the compiler generate special inline functions for every type parameter we pass in this function.  

And voila, we have a very simple component model that can be mixed in for different classes and if needed a different implementation can be created that suits your needs. Using extension methods this can be improved upon to add extra behavior, e.g. a way of querying a class for multiple components and invoking a block on those when they are both not null. The latter can be done like this:

```kotlin
// more if you need them... however, 3 typically suits my needs
fun <C1, R> ComponentHolder.query(t1: KClass<C1>, block: (C1) -> R): R? where C1 : Component {
    val c1 = getComponent(t1) ?: return null
    return block(c1)
}

fun <C1, C2, R> ComponentHolder.query(t1: KClass<C1>, t2: KClass<C2>, block: (C1, C2) -> R): R? 
where C1 : Component, C2 : Component {
    val c1 = getComponent(t1) ?: return null
    val c2 = getComponent(t2) ?: return null
    return block(c1, c2)
}

fun <C1, C2, C3, R> ComponentHolder.query(t1: KClass<C1>, t2: KClass<C2>, t3: KClass<C3>, block: (C1, C2, C3) -> R): R? 
where C1 : Component, C2 : Component, C3 : Component {
    val c1 = getComponent(t1) ?: return null
    val c2 = getComponent(t2) ?: return null
    val c3 = getComponent(t3) ?: return null
    return block(c1, c2, c3)
}

// test code
val player = Entity(1)
player.setComponent(Health(100))
player.setComponent(Dynamics(100.0, 5.0, 2.0))
player.setComponent(Sprite(ByteArray(0)))

val monster = Entity(2)
monster.setComponent(Health(130))
monster.setComponent(Dynamics(150.0, 10.0, -4.0))
monster.setComponent(Sprite(ByteArray(0)))

val background = Entity(3)
monster.setComponent(Sprite(ByteArray(0)))

val entities = listOf(player, monster, background)

// draw all entities
entities.forEach { entity ->
    entity.query(Dynamics::class, Sprite::class) { dynamics, sprite ->
        println("Drawing entity ${entity.id} on position x=${dynamics.position.first}, y=${dynamics.position.second}")
    } ?: println("Entity ${entity.id} doesn't have the required components")
}

/*  Result:
    Drawing entity 1 on position x=5.0, y=2.0
    Drawing entity 2 on position x=10.0, y=-4.0
    Entity 3 doesn't have the required components
*/ 
```

## Components without reflection

It isn't always possible to use reflection on the target platform, especially when working with Kotlin Multiplatform. Luckily Kotlin has a good typesystem and type-inference system which makes transforming the code above to a non-reflection variant pretty easy. It is clear we need some sort of typesafe key to store and retrieve our components. Let us define those as follows, including the rewritten `ComponentHolder`:

```kotlin
interface ComponentKey<C>

interface Component<C> {
    val key: ComponentKey<C>
}

interface ComponentHolder {
    fun setComponent(component: Component<*>)
    fun <C> getComponent(key: ComponentKey<C>): C?
}

class MapComponentHolder : ComponentHolder {
    private val components = mutableMapOf<ComponentKey<*>, Any>()

    override fun setComponent(component: Component<*>) {
        components[component.key] = component
    }

    @Suppress("UNCHECKED_CAST")
    override fun <C> getComponent(key: ComponentKey<C>): C? {
        return components[key] as? C
    }
}
```

As can be seen, they are nearly identical, except for the `Key<C>` and `HasKey<C>` construct. We only need to define the keys for the components like this:

```kotlin
class Health(initialAmount: Int) : Component<Health> {
    override val key = Key
    
    // ... identical

    object Key : ComponentKey<Health>
}

class Dynamics(
    // ... identical
) : Component<Dynamics> {
    override val key = Key

    // ... identical
    
    object Key : ComponentKey<Dynamics>
}
```

And also here, it is nearly identical. As you can expect, the resulting code to actually use it is also nearly identical:
```kotlin
val player = Entity(Random.nextLong())
player.setComponent(Health(100))
player.setComponent(Dynamics(100.0, 5.0, 2.0))

assertEquals(100, player.getComponent(Health.Key)?.currentHealth)
assertEquals(5.0 to 2.0, player.getComponent(Dynamics.Key)?.position)
```

One of the big benefits of this approach is that you aren't tied to `objects` as keys. Why not use a class and have multiple components for the same component-type, but a different key? For example, a `Sprite` could be in the foreground, or in the background, but they can both be added to an `Entity`. One could solve that by having 2 types of sprites, or some sort of `SpriteSet` component. Those are all valid approaches, but below is another one:

```kotlin
// make sure to make this a data-class for automatic generation of equals / hashCode for the map later
data class ParameterizedComponentKey<C, T>(val parameter: T): ComponentKey<C>

enum class SpriteTypeEnum {
    Foreground,
    Background;
}

class Sprite(val spriteData: ByteArray, val type: SpriteTypeEnum) : Component<Sprite> {
    override val key = Key[type]

    object Key {
        operator fun get(type: SpriteTypeEnum): ComponentKey<Sprite> = VariableComponentKey(type)
    }
}

// test code
val world = Entity(Random.nextLong())
world.setComponent(Sprite("Foreground".encodeToByteArray(), SpriteTypeEnum.Foreground))
world.setComponent(Sprite("Background".encodeToByteArray(), SpriteTypeEnum.Background))

assertEquals("Foreground", world.getComponent(Sprite.Key[SpriteTypeEnum.Foreground])?.spriteData?.decodeToString())
assertEquals("Background", world.getComponent(Sprite.Key[SpriteTypeEnum.Background])?.spriteData?.decodeToString())
```

We generate a new kind of `ComponentKey` here which takes a parameter to distinguish it. Using an operator function on the `Key` object we are able to generate `ComponentKey<Sprite>`'s on demand, based on the `SpriteTypeEnum`. So now we have a parameterized, typesafe method of dynamically adding components to an existing object.

## Conclusion

This concludes Part 2 on Compositional Patterns in Kotlin where we looked into a method with reflection, and a method without. Personally I'd favor the non-reflection version, since I'd like to keep my code as portable as possible without fixing myself to an underlying runtime, especially when a portable version is just as easy.

This was my second blog post I have written, and I thoroughly enjoyed it. However, by learning and making mistakes you improve. I am very interested in your critique, or questions. So contact me via [e-mail](mailto:info@avwie.nl), Twitter [@avwie](https://twitter.com/avwie), or at [my repository of the coding examples](https://github.com/avwie/kotlin-blog).