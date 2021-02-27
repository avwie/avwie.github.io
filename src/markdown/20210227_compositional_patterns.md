---
slug: "/compositional-patterns-in-kotlin"
date: "2021-02-28"
title: "Compositional Patterns in Kotlin"
hero: "../images/20210227_compositional_patterns/hero.jpg"
---
Roughly speaking there are two ways to obtain polymorphic behavior in OOP languages, 'classical' inheritance and composition. There are clear benefits in either approach depending on the domain one is trying to model. So this post is not a rant about the drawbacks of inheritance, but more an evaluation of the benefits of composition in some domains. A lot has been written about both approaches, and their intended uses, but when speaking for myself I see clear benefit of inheritance when the domain is clearly described by a hierarchical tree, or the hierarchies are not very deep and diverse and there are not a lot of cross-cutting concerns. Animals are a typical example of a hierarchy that models pretty well into the inheritance paradigm. A typical drawback of deep inheritance hierarchies can be that they can be a little reluctant to change.

However, composition is beneficial when there is not a clear hierarchy and there are a lot of cross-cutting concerns. Think of game engines and all the elements there. A player has health, some sprite and some positional information associated with it, just like an enemy. However, a plant or a cloud are maybe just graphics and a position. Then an enemy and a player both can have some sort of weapon or attack method. However, a venomous plant on the other hand also should have some attack method. When trying to model this in a classical inheritance tree one gets stuck pretty fast.

Whereas inheritance is typically supported by the language in its syntax (think of `class`, `interface`, `extends` `implements` keywords in typical languages), and as such was a go-to method of modelling until a few years ago, not a lot of languages support composition natively as a language feature with keywords. Nevertheless, there is some change in that respect in recent years in languages to provide constructs for composition. Scala and Rust provide a trait system, C# has default interface implementation, Java has project Lombok which aims to provide a delegation system.

This post aims to show a few different methods of obtaining composition in **Kotlin**.

## The delegation pattern

Kotlin has language support for the [delegation pattern](https://kotlinlang.org/docs/delegation.html). I think it is best shown via some code examples. Let's stay in the theme of the game example above.

### Defining the components
First we need to describe the components we want to have, lets model these as `interfaces`:
```kotlin
interface Health {
    val health: Int
    val isDead: Boolean

    fun damage(amount: Int)
    fun replenish(amount: Int)
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
    
    fun replenish(amount: Int) {
        health += amount
    }
}
```

### Creating the default implementations

We can now define default implementations for the interfaces, to be used later for the composition:
```kotlin
class HealthImpl(initialHealth: Int): Health {
    override var health: Int = initialHealth
        private set

    override val isDead: Boolean get() = health <= 0

    override fun damage(amount: Int) {
        health -= amount
    }

    override fun replenish(amount: Int) {
        health += amount
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

### Composing classes

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

### Constructing instances

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

As can be seen the actual code becomes quite clear, _and_, the invariants are enforced by the compiler. It is impossible to have a `Player` attack a `Tree`. We can easily iterate over the cross-cutting concerns and process them in the case of `Dynamics` and `Drawable`.


