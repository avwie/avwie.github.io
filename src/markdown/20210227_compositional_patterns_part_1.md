---
slug: "/compositional-patterns-in-kotlin-part-1-delegation"
date: "2021-02-27"
title: "Compositional Patterns in Kotlin Part 1 - Delegation"
hero: "../images/20210227_compositional_patterns_part_1/hero.jpg"
---
Roughly speaking there are two ways to obtain polymorphic behavior in OOP languages, 'classical' inheritance and composition. There are clear benefits in either approach depending on the domain one is trying to model. So this post is not a rant about the drawbacks of inheritance, but more an evaluation of the benefits of composition in some domains. A lot has been written about both approaches, and their intended uses, but when speaking for myself I see clear benefit of inheritance when the domain is clearly described by a hierarchical tree, or the hierarchies are not very deep and diverse and there are not a lot of cross-cutting concerns. Animals are a typical example of a hierarchy that models pretty well into the inheritance paradigm. A typical drawback of deep inheritance hierarchies can be that they can be a little reluctant to change.

However, composition is beneficial when there is not a clear hierarchy and there are a lot of cross-cutting concerns. Think of game engines and all the elements there. A player has health, some sprite and some positional information associated with it, just like an enemy. However, a plant or a cloud are maybe just graphics and a position. Then an enemy and a player both can have some sort of weapon or attack method. However, a venomous plant on the other hand also should have some attack method. When trying to model this in a classical inheritance tree one gets stuck pretty fast.

Whereas inheritance is typically supported by the language in its syntax (think of `class`, `interface`, `extends` `implements` keywords in typical languages), and as such was a go-to method of modelling until a few years ago, not a lot of languages support composition natively as a language feature with keywords. Nevertheless, there is some change in that respect in recent years in languages to provide constructs for composition. Scala and Rust provide a trait system, C# has default interface implementation, Java has project Lombok which aims to provide a delegation system.

This post aims to show a few different methods of obtaining composition in **Kotlin**.

## The delegation pattern

Kotlin has language support for the [delegation pattern](https://kotlinlang.org/docs/delegation.html). In short, it means that interfaces that a class wants to implement are actually implemented by an instance of another class that is part of the main class and the methods are _delegated_ to this other class. For the outsider it looks as if the class implements the interface like it should, however under the hood all calls are delegated to another. 

An important aspect to note here is is that the composition all takes place during the definition of the classes. In other words, it is static, or compile-time, composition and as such it is not possible to compose entities during runtime. However, this will come in the next post.

I think it is best shown via some code examples. Let's stay in the theme of the game example above.

## Defining the components
First we need to describe the components we want to have, lets model these as `interfaces`:
```kotlin
interface Health {
    val health: Int
    val isDead: Boolean

    fun damage(amount: Int)
}

interface Sprite {
    val spriteData: ByteArray
}

interface Position {
    val position: Pair<Double, Double>
}

interface Dynamics : Position {
    val mass: Double
    val velocity: Pair<Double, Double>
    val acceleration: Pair<Double, Double>

    fun applyForce(amount: Pair<Double, Double>)
    fun updateDynamics(dt: Double)
}

interface Drawable : Sprite, Position

interface Dangerous {
    val damage: Int

    fun attack(other: Health)
}
```

These interfaces clearly communicate their intent. In the `Dangerous` interface the attack references some other entity which should have a `Health` interface. We also combine interfaces to, `Drawable` in this case, to show that if two interfaces are combined this can lead to new behavior.

I could have chosen to have the state variables be `var`s and have reference implementations of the functions in the interfaces themselves, but I chose not to. The reason is that I only want to have the state variables be mutated by the methods inside the interfaces, to keep things tidy and controlled. However, you could go the other way, which would require less code in the long run with the cost of loosing track how state variables are mutated. This would result in a rewritten `Health` interface like this:

```kotlin
interface Health {
    var health: Int
    val isDead: Boolean get() = health <= 0
    
    fun damage(amount: Int) {
        health -= amount
    }
}
```

## Creating the default implementations

We can now define default implementations for the interfaces, to be used later for the composition:
```kotlin
class HealthImpl(initialHealth: Int): Health {
    override var health: Int = initialHealth
        private set

    override val isDead: Boolean get() = health <= 0

    override fun damage(amount: Int) {
        health -= amount
    }
}

class SpriteImpl(override val spriteData: ByteArray): Sprite

class PositionImpl(override val position: Pair<Double, Double>): Position

class DynamicsImpl(override val mass: Double, initialPosition: Pair<Double, Double>): Dynamics {
    override var position: Pair<Double, Double> = initialPosition
        private set

    override var velocity: Pair<Double, Double> = 0.0 to 0.0
        private set

    override var acceleration: Pair<Double, Double> = 0.0 to 0.0
        private set

    override fun applyForce(amount: Pair<Double, Double>) {
        val (ax, ay) = acceleration
        val (fx, fy) = amount
        acceleration = ax + fx / mass to ay + fy / mass
    }

    override fun updateDynamics(dt: Double) {
        val (ax, ay) = acceleration
        val (vx, vy) = velocity
        val (sx, sy) = position
        
        // this is clearly naive, since this is not deterministic, however... it serves the purpose for this post
        velocity = vx + ax * dt to vy + ay * dt
        position = sx + vx * dt to sy + vy * dt
    }
}

class DangerousImpl(override val damage: Int) : Dangerous {
    override fun attack(other: Health) {
        other.damage(damage)
    }
}
```

What is clearly seen here is that the reference implementations contain all the code related to their respective domain. This makes it extremely easy to test them since they are simple. Setting up unit tests for them is a breeze and that also means that you can be very certain that any class that uses any of the well-tested reference implementations will behave as it should.

## Composing classes

Using the reference implementations we can now construct our classes using the delegation pattern. What we immediately notice is that the constructor becomes quite big. However, we can mitigate this by just defining methods on the `companion object` which makes the construction of a class easier, by using the reference implementations.

```kotlin
class Player( val name: String, healthImpl: Health, spriteImpl: Sprite, dynamicsImpl: Dynamics, dangerousImpl: Dangerous):
    Drawable, Health by healthImpl, Sprite by spriteImpl, Dynamics by dynamicsImpl, Dangerous by dangerousImpl {

    companion object {
        val sprite = SpriteImpl(ByteArray(0)) // just for mocking purposes

        fun new(name: String, health: Int, position: Pair<Double, Double>, damage: Int): Player {
            return Player(name, HealthImpl(health), sprite, DynamicsImpl(74.0, position), DangerousImpl(damage))
        }
    }
}

class Orc(healthImpl: Health, spriteImpl: Sprite, dynamicsImpl: Dynamics, dangerousImpl: Dangerous):
    Drawable, Health by healthImpl, Sprite by spriteImpl, Dynamics by dynamicsImpl, Dangerous by dangerousImpl {

    companion object {
        val sprite = SpriteImpl(ByteArray(0)) // just for mocking purposes

        fun new(position: Pair<Double, Double>, damage: Int): Orc {
            return Orc(HealthImpl(150), sprite, DynamicsImpl(120.0, position), DangerousImpl(damage))
        }
    }
}

class Tree(spriteImpl: Sprite, positionImpl: PositionImpl):
    Drawable, Sprite by spriteImpl, Position by positionImpl {

    companion object {
        val sprite = SpriteImpl(ByteArray(0)) // just for mocking purposes

        fun new(position: Pair<Double, Double>): Tree {
            return Tree(sprite, PositionImpl(position))
        }
    }
}

class VenomousPlant(spriteImpl: Sprite, positionImpl: PositionImpl, dangerousImpl: Dangerous):
    Drawable, Sprite by spriteImpl, Position by positionImpl, Dangerous by dangerousImpl {

    companion object {
        val sprite = SpriteImpl(ByteArray(0))

        fun new(position: Pair<Double, Double>, damage: Int): VenomousPlant {
            return VenomousPlant(sprite, PositionImpl(position), DangerousImpl(damage))
        }
    }
}
```

Okay, that was quite some code, but the implications are clear. We are constructing classes by combining reference implementations for the interfaces we want to implement by leveraging the Kotlin-specific `[interface] by [implementation]` keyword. Whats even more interesting is that we implement `Drawable` by specifying implementations for the `Sprite` and `Position` interfaces, even though `Orc` and `Player` both implement the `Position` interface again via the `Dynamics` interface.  

## Constructing instances

It is now quite a breeze to instantiate classes:
```kotlin
// constructing instances
val player = Player.new(name = "Frodo", health = 100, position = 0.0 to 0.0, damage = 30)
val orc = Orc.new(position = 5.0 to 0.0,  damage = 30)
val tree = Tree.new(position = 15.0 to 25.0)
val poisonIvy = VenomousPlant.new(position = 8.0 to 11.0, damage = 5)

val entities : List<Any> = listOf(player, orc, tree, poisonIvy)

// have them interact
player.attack(orc)
orc.attack(player)
poisonIvy.attack(player)
// player.attack(tree) <- does not compile, since tree does not have a Health component

println(tree.position) // prints Pair(15.0, 25.0)

// update all dynamics
entities.filterIsInstance<Dynamics>().forEach { dynamics -> dynamics.updateDynamics(0.01) }

// draw them
entities.filterIsInstance<Drawable>().foreach { drawable ->
    screen.draw(drawable.position, drawable.spriteData) 
}
```

As can be seen the actual code becomes quite clear, _and_, the invariants are enforced by the compiler. It is impossible to have a `Player` attack a `Tree`. We can easily iterate over the cross-cutting concerns and process, which is shown in the cases of `Dynamics` and `Drawable`.

## Extending the model

One of the clear benefits of the compositional model is that it is pretty easy to extend it. Imagine there are some entities in the world that are edible and by eating you gain health. In the traditional inheritance tree one would add interface `Edible` at all the places this is required and implement those. However, we can easily extend it by creating a new `Interface`, building a reference implementation _and_ adding the reference implementation to the concrete classes which require those.

```kotlin
interface Edible {
    val nutritionalValue: Int
}

// and we modify Health
interface Health {
    // ...
    fun eat(edible: Edible) // this one is added
}

class EdibleImpl(override val nutritionalValue: Int): Edible

class HealthImpl(initialHealth: Int): Health {
    // ... 
    // the eat function is implemented
    override fun eat(edible: Edible) {
        health += edible.nutritionalValue
    }
}

class Potato(spriteImpl: Sprite, positionImpl: Position, edibleImpl: EdibleImpl):
    Drawable, Sprite by spriteImpl, Position by positionImpl, Edible by edibleImpl {

    companion object {
        val sprite = SpriteImpl(ByteArray(0))
        
        fun new(nutritionalValue: Int, position: Pair<Double, Double>): Potato {
            return Potato(sprite, PositionImpl(position), EdibleImpl(nutritionalValue))
        }
    }
}

// and using it is easy
val food = Potato.new(10, 5.0 to 3.0)
player.eat(food);
```
## Fun with extensions
One of the cool features of Kotlin is the ability to add [extensions](https://kotlinlang.org/docs/extensions.html). This is a way to extend the behavior of certain types with extra functions or values without modifying the original code. 

Imagine we want to have a Berserk function. When  `health <= 10` any player can go berserk and do double damage. This requires a class to implement both `Health` and `Dangerous`. To do this with extensions one can follow this approach.

```kotlin
// Can be in any file. Typically I place it in a subpackage called 'extensions' to keep it clean.
val <T> T.isBerserk : Boolean where T : Health, T : Dangerous get() {
    return this.health <= 10 && !this.isDead
}

fun <T> T.berserkAttack(enemy: Health) where T : Health, T : Dangerous {
    if (this.isBerserk) {
        enemy.damage(this.damage * 2)
    } else {
        enemy.damage(this.damage)
    }
}

// and in your game code:
val berserkPlayer = Player.new(name = "Almost dead", health = 7, position = 0.0 to 0.0, damage = 30)
val unfortunateOrc = Orc.new(position = 5.0 to 0.0,  damage = 30)

println(unfortunateOrc.health) // prints 150
berserkPlayer.berserkAttack(unfortunateOrc)
println(unfortunateOrc.health) // prints 90
```

By leveraging the granularity of the interfaces we have defined we have the ability to add very specific behavior based on combinations of these interfaces. This is exactly something you would expect from a system with a high degree of composability.

## Constructing instances with the builder pattern

We used a companion object to create new instances. This works pretty well, but when the entities will have a lot of components these companion functions will become pretty large. Therefore, an alternative is to go to a builder pattern and have a separate class manage for us the building of the instance. Kotlin assists here as well in creating a nice API by providing us with the language feature: [Function literals with a receiver](https://kotlinlang.org/docs/lambdas.html#function-literals-with-receiver). Using this feature we can pass a `lambda` function which specifies what the `this` should be in scope of that function. 

Let me elaborate by first defining some helper class and interface;
```kotlin
interface Builder<T> {
    fun build(): T
}

interface BuilderProvider<T, B : Builder<T>> {
    fun builder(): B
}

fun <T, B : Builder<T>> build(provider: BuilderProvider<T, B>, block: B.() -> Unit): T {
    val builder = provider.builder()
    block(builder)
    return builder.build()
}
```

Well, this certainly looks convoluted. Bear with me when I show you the implementation for `Player` and I hope it becomes a little more clear:
```kotlin
class Player(
    val name: String,
    healthImpl: Health,
    spriteImpl: Sprite,
    dynamicsImpl: Dynamics,
    dangerousImpl: Dangerous
) : Drawable, Health by healthImpl, Sprite by spriteImpl, Dynamics by dynamicsImpl, Dangerous by dangerousImpl {

    companion object : BuilderProvider<Player, PlayerBuilder> {
        override fun builder(): PlayerBuilder = PlayerBuilder()
    }
}

class PlayerBuilder : EntityBuilder<Player> {
    val sprite = SpriteImpl(ByteArray(0))

    var name = ""
    var health = 100
    var damage = 10
    var x = 0.0
    var y = 0.0
    var mass = 80.0

    override fun build(): Player =
        Player(name, HealthImpl(health), sprite, DynamicsImpl(mass, x to y), DangerousImpl(damage))
}
```

We now have a companion object on `Player` that implements `EntityBuilderProvider` and giving us a `PlayerBuilder` (which implements `Builder<Player>`) back. With the help of the `build()` helper function above it is now possible to create a type-safe instantiation of the class in an easier API.

```kotlin
val player = build(Player) { // [this] is of type PlayerBuilder
    name = "Beeblebrox"
    health = 120

    x = 3.0
    y = 4.0
}
```

So what is exactly happening? The Kotlin type-inference does a lot of work for us to make the API nice to work with. But let's go through it step by step:
```kotlin
val player = build(Player) { //.... }

// this can be rewritten as
val player = build(Player, { // .... })

// so that means that:
Player = EntityBuilderProvider
block = { // ... })

// and in `build` the following happens
val builder = provider.builder() // which is an instance of PlayerBuilder
block(builder) // the block is run, with PlayerBuilder as the receiver, meaning that, inside the block-scope, `this` refers to the instance of PlayerBuilder
return builder.build() // the PlayerBuilder.build() method returns a Player and the builder is complete
```

This looks quite convoluted in order to create a simple instance of a class. However, when entities become more and more complicated or accumulate more components which might even be optional, then the builder patterns takes care of the construction of the entity whilst the entity itself is more concerned with the entity itself.

## Conclusion

This concludes Part 1 on Compositional Patterns in Kotlin. This is a compositional pattern that allows for compile-time, typesafe, composition of classes. The next part will focus on *runtime* composition, while still keeping type-safety _and_ without reflection. One of the ways to obtain that is to go to a *component-based architecture*. This is a first step to a different way of handling your domain model. As I said before, this is not always the best way, just like inheritance trees aren't, but it is _a_ way. Experiment and try and see where it fits your needs.

This was my _first ever_ blog post I have written, and I thoroughly enjoyed it. However, by learning and making mistakes you improve. I am very interested in your critique, or questions. So contact me via [e-mail](mailto:info@avwie.nl), Twitter [@avwie](https://twitter.com/avwie), or at [my repository of the coding examples](https://github.com/avwie/kotlin-blog).