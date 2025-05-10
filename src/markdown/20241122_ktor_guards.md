---
slug: "/ktor-guards"
date: "2024-11-22"
title: "Building Route Guards for Ktor 3 servers"
---

The last few months I have been very busy with developing server applications using Ktor. 
Ktor is a Kotlin-based framework for building asynchronous servers and clients. One of the strengths of Ktor is that 
it is highly _un_opinionated. This is very powerful in the sense that it doesn't force you to follow a specific convention
for developing applications and gives you total freedom. To accommodate this freedom, Ktor provides a lot of flexibility by being very modular with plugins.

One of the things that I have been missing in Ktor is the ability to define route guards. Route guards are a way to protect routes from unauthorized access.
A lot of web frameworks offer facilities to define route guards, but Ktor doesn't have this out of the box. In this blog post, I will show you how you can build route guards for Ktor 3 servers.

## What should a route guard look like

A route guard is a function that is executed before the actual route handler is executed. The route guard can decide whether the route handler should be executed or not.
Examples of route guards are:
- Authentication: check if the user is authenticated
- Authorization: check if the user has the right permissions
- Rate limiting: check if the user has exceeded the rate limit
- Go crazy: Only allow access to the route handler on a full moon

The result of a route guard can be:
- Allow the route handler to be executed
- Deny the route handler to be executed
- Redirect to another route
- Throw an exception
- Respond with a HTTP status code, like `401 Unauthorized`

The input of the route guard is the current `ApplicationCall`, so a route guard can access the request, response, and other information about the current request.

So in essence, one can define a route guard as a simple interface

```kotlin
interface RouteGuard {
    suspend fun check(call: ApplicationCall): AuthorizationResult
}

sealed interface AuthorizationResult {
    object Success : AuthorizationResult
    data class Unauthorized(val message: String, val statusCode: HttpStatusCode = HttpStatusCode.Forbidden) : AuthorizationResult
}
```

This gives us a very simple interface to implement for route guards. The `AuthorizationResult` clearly communicates the result of the route guard.

However, we might want to have a more flexible way to handle what happens when the authorization fails. For example, we might want to redirect to another route, or we might want to throw an exception.

To accommodate this we augment the route guard with an _optional_ `val onUnauthorized: OnUnauthorized?` parameter.

```kotlin
typealias OnUnauthorized = suspend (call: ApplicationCall, result: Guard.AuthorizationResult.Unauthorized) -> Unit

interface RouteGuard {
    val onUnauthorized: OnUnauthorized?
    suspend fun check(call: ApplicationCall): AuthorizationResult
}
```

## How _NOT_ to implement it

I read quite a few blogposts about how to implement route guards, but a few of them make a thinking error. They add a `RouteScopedPlugin` to a `Routing` block like this:
```kotlin
val MyRouteGuardPlugin = createRouteScopedPlugin(name = "...", createConfiguration = { ... }) {
    // .... implementation
    
    onCall { call ->
        // .... implementation
    }
}

fun Route.guard(roles: List<String>, block: Route.() -> Unit) {
    install(MyRouteGuardPlugin) {
        // adding the roles to the config
    }     
    block()
}

// Usage
routing {
    guard(listOf("admin")) {
        get("/admin") {
            call.respondText("Hello admin")
        }
    }
    
    get("/") {
        call.respondText("Hello world")
    }
}
```

This is incorrect! Because you can basically rewrite the above `routing` block to:
```kotlin
routing {
    install(MyRouteGuardPlugin) {
        // adding the roles to the config
    }
    
    get("/admin") {
        call.respondText("Hello admin")
    }
    
    get("/") {
        call.respondText("Hello world")
    }
}
```

Can you see the subtle difference? The `MyRouteGuardPlugin` is applied to all the routes, so the `/` route is also protected now. This is not what we want. We only want to protect the `/admin` route.

## Implementing the RouteGuardPlugin

To implement route guards correctly, we first need to have a `RouteGuardPlugin` that actually handles the guarding of the routes. 
We use a `RouteScopedPlugin` for this with a configuration block that defines the guard.

First we define the configuration:
```kotlin
class RouteGuardPluginConfiguration {
    var onUnauthorized: OnUnauthorized = { call, result ->
        call.respondText(status = result.statusCode, text = result.message)
    }
}
```

As you can see we also define an `onUnauthorized` handler on the plugin level. This is the default handler that is called when no `onUnauthorized` handler is defined on the `RouteGuard`.

Next, we define the `RouteGuardPlugin`
```kotlin
fun RouteGuardPlugin(guard: Guard) = createRouteScopedPlugin(
    name = "GuardPlugin",
    createConfiguration = ::RouteGuardPluginConfiguration
) {
    onCall { call ->
        when (val result = guard.isAuthorized(call)) {
            is Guard.AuthorizationResult.Success -> return@onCall
            is Guard.AuthorizationResult.Unauthorized -> {
                (guard.onUnauthorized ?: pluginConfig.onUnauthorized).invoke(call, result)
            }
        }
    }
}
```

When a call comes in, this plugin hooks into that call and iterates over all the guards and checks if the route is authorized. 
If not, it calls the `onUnauthorized` handler of the guard, or the default `onUnauthorized` handler of the plugin and end  

## Installing the RouteGuardPlugin

To install the `RouteGuardPlugin` we need to define a `guard` function that installs the plugin and adds the guard to the configuration.
However, we must make sure we don't make the same error as above where the scope of the plugin is wrong. 

We want something like this (pseudo code):
```kotlin
routing {
    {
        install(RouteGuardPlugin) {
            guard(...) {
                get("/admin") {
                    call.respondText("Hello admin")
                }
            }
        }
    }
    
    get("/") {
        call.respondText("Hello world")
    }
}
```

The exact code above is not possible, but we can achieve this by creating our own `RouteSelector`. Every 'route' in the `routing` block is actually a `RouteSelector` that is added to the `Routing` block.
Ktor provides a lot of implementations themselves, but we can also create our own. 

A `RouteSelector` is defined as:
```kotlin
public abstract class RouteSelector {

    /**
     * Evaluates this selector against [context] and a path segment at [segmentIndex].
     */
    public abstract suspend fun evaluate(context: RoutingResolveContext, segmentIndex: Int): RouteSelectorEvaluation
}
```

So, what is this `RouteSelectorEvaluation`? Looking in the source code we see that it is a `sealed class` and it has a lot of implementation.
Basically it defines the success or failure of the evaluation of the `RouteSelector` and some additional information regarding how 'good' the match was.

Luckily, there is the following predefined `RouteSelectorEvaluation` we can use:

```kotlin
/**
 * Routing evaluation succeeded for a [qualityTransparent] value. Useful for helper DSL methods that may wrap
 * routes but should not change priority of routing.
 */
public val Transparent: RouteSelectorEvaluation =
    RouteSelectorEvaluation.Success(RouteSelectorEvaluation.qualityTransparent)
```

Looking at the comments, this is exactly what we need? But how do we use it? Well, besides the pretty DSL for routing we can actually just use
_imperative_ code to define the routes as well.

```kotlin
// first define our own RouteSelector
class RouteGuardRouteSelector : RouteSelector() {
    override suspend fun evaluate(context: RoutingResolveContext, segmentIndex: Int): RouteSelectorEvaluation {
        return RouteSelectorEvaluation.Transparent
    }
}

// then allow us to use the selector on a `Route` object (`Routing` is also a `Route`)
fun Route.guard(guard: Guard, onUnauthorized: OnUnauthorized?, build: Route.() -> Unit) {
    val guardRoute = createChild(RouteGuardRouteSelector())
    guardRoute.install(RouteGuardPlugin(guard)) {
        if (onUnauthorized != null) {
            this.onUnauthorized = onUnauthorized
        }
    }
    guardRoute.build()
}

// and a simple helper function to make it more readable
fun Route.guard(guard: Guard, build: Route.() -> Unit) {
    guard(guard = guard, onUnauthorized = null, build = build)
}
```

## Putting it all together

Imagine we have a few guards defined like this:
```kotlin
fun roles(vararg roles: String): Guard {
    return object : Guard {
        override suspend fun isAuthorized(call: ApplicationCall): AuthorizationResult {
            val user = call.principal<UserPrincipal>() ?: return AuthorizationResult.Unauthorized("Unauthorized", HttpStatusCode.Unauthorized)
            if (roles.ll { user.roles.contains(it) }) {
                return AuthorizationResult.Success
            }
            return AuthorizationResult.Unauthorized("Unauthorized", HttpStatusCode.Forbidden)
        }
    }
}

val isAuthenticated: Guard = object : Guard {
    override suspend fun isAuthorized(call: ApplicationCall): AuthorizationResult {
        return if (call.principal<UserPrincipal>() != null) {
            AuthorizationResult.Success
        } else {
            AuthorizationResult.Unauthorized("Unauthorized", HttpStatusCode.Unauthorized)
        }
    }
}

val fullMoon : Guard = object : Guard {
    // I have no clue how to implement this
}
```

Then we can simply use our `guard` function to protect our routes:
```kotlin
routing {
    guard(isAuthenticated) {
        get("/user") {
            call.respondText("Hello in your user profile")
        }
        
        guard(roles('admin')) {
            get("/admin") {
                call.respondText("Hello admin")
            }
        }
    }
    
    get("/") {
        call.respondText("Hello world")
    }
}
```

One can easily extend it with some helper functions as well:
```kotlin
fun allOf(vararg guards: Guard): Guard {
    return object : Guard {
        override val onUnauthorized: OnUnauthorized? = null
        override fun isAuthorized(call: ApplicationCall): AuthorizationResult {
            if (guards.all { it.isAuthorized(call) is AuthorizationResult.Success }) {
                return AuthorizationResult.Success
            } else {
                return AuthorizationResult.Unauthorized("Unauthorized", HttpStatusCode.Forbidden)
            }
        }
    }
}

fun anyOf(vararg guards: Guard): Guard {
    return object : Guard {
        override val onUnauthorized: OnUnauthorized? = null
        override fun isAuthorized(call: ApplicationCall): AuthorizationResult {
            if (guards.any { it.isAuthorized(call) is AuthorizationResult.Success }) {
                return AuthorizationResult.Success
            } else {
                return AuthorizationResult.Unauthorized("Unauthorized", HttpStatusCode.Forbidden)
            }
        }
    }
}

fun and(left: Guard, right: Guard): Guard {
    return allOf(left, right)
}

fun or(left: Guard, right: Guard): Guard {
    return anyOf(left, right)
}
```

Which results in the following usage:
```kotlin
routing {
    guard(or(isAuthenticated, isFullMoon)) {
        // we have a a security hole during full moon
        get("/user") {
            call.respondText("Hello in your user profile")
        }
        
        get("/admin") {
            call.respondText("Hello admin")
        }
    }
    
    get("/") {
        call.respondText("Hello world")
    }
}
```

## Conclusion

I hope this blog post gives you a good idea of how you can implement route guards in Ktor. If you have any questions,
or have seen any errors, please let me know by sending me an email. I am always happy to help you out or learn.
