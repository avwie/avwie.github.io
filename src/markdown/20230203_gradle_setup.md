---
slug: "/gradle-setup-with-convention-plugins"
date: "2023-02-03"
title: "Building a Gradle setup with convention plugins for quick Kotlin experiments"
---

I try to experiment a lot in Kotlin because I love the language so much. Since I like to use different features for different experiments, I normally just made a new project for every experiment and placed it under a root project. But since Kotlin uses Gradle I noticed that I really hated starting a new project. Mind you, this is not due to Gradle per se, but more my inability to understand Gradle. Gradle is just a very complicated tool. For basic use-cases it is quite simple, but when you work with beta-Compose libraries, different plugins and what not it becomes a bit of a hassle. At least for me. And I sometimes spent quite some time setting up a new project just for experimentation.

Since it was hampering my creativity I decided to find out if I can make my life a bit easier. Since I figured my use-case is not unique at all, I decided to ask in the Kotlin Slack channel if there is a way to make my life easier. To have something that does this:

- Initialize all required repositories
- Install necessary Kotlin compiler plugins (serialization, Compose)
- Setup a basic multiplatform project with JS and JVM targets
- Add my most used dependencies
- Have a centralized way of managing versioning

## Version catalogs

As a response I got that for versioning the preferred way is: [version catalogs](https://docs.gradle.org/current/userguide/platforms.html). And the most notable here is the versioning via a [libs.versions.toml](https://docs.gradle.org/current/userguide/platforms.html#sub::toml-dependencies-format) file which needs to be placed in the root `gradle` folder.

This `libs.versions.toml` file will be automatically compiled to Java code, for the Gradle build only, not for your actual program code, so you can access it in a typesafe way in your Gradle scripts.

So as an example, I create the following `libs.versions.toml`:

```toml
[versions]
jetbrains-datetime = "0.4.0"
jetbrains-serialization-json = "1.4.1"
jetbrains-collections-immutable = "0.3.5"

[libraries]
jetbrains-datetime = { module = "org.jetbrains.kotlinx:kotlinx-datetime", version.ref = "jetbrains-datetime" }
jetbrains-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "jetbrains-serialization-json" }
jetbrains-collections-immutable = { module = "org.jetbrains.kotlinx:kotlinx-collections-immutable", version.ref = "jetbrains-collections-immutable" }
```

then, in my `build.gradle.kts` I can just say:

```kotlin
dependencies {
    implementation(libs.jetbrains.datetime)
    implementation(libs.jetbrains.serialization.json)
    implementation(libs.jetbrains.collections.immutable)
}
```

## Convention Plugins

What still remains is basically a way to configure a project automatically via a plugin. Well, apparently [convention plugins](https://docs.gradle.org/current/samples/sample_convention_plugins.html) are the way to go! There is an Android project that follows quite some best practices, called [Now in Android](https://github.com/android/nowinandroid/tree/main/build-logic), that has this implemented on a larger scale.

A convention plugin is a Kotlin script, ending in `<plugin-name>.gradle.kts` that is precompiled before actually other Gradle projects are loaded. So you can actually load these precompiled plugins using `id(<plugin-name>)` in your 'normal' Gradle projects and have them execute. These convention plugin scripts are nothing more than normal `build.gradle.kts` scripts. So you can just do exactly the same.

However, there are some caveats....of course.

Since it is precompiled, before the other Gradle stuff runs, you can't use some normal Gradle build script things you expect to have. So the version catalogs can't be used with the typesafe API. Luckily we can still use a non-typesafe way. Besides that, any plugin you require _in_ your precompiled build-script needs to be added as an `implementation` dependency in the `build.gradle.kts` of the project where the plugins are defined.

This sounds all mightely confusing, so better to just start.

## Basic project setup

I make a new root project that will contain projects with my own written libraries, as well projects with my experiments/examples and a project which contains the convention plugins. I call the project `nl.avwie.kotlinx` and this is the basic folder structure

```
kotlinx
  |- plugins
     |- build.gradle.kts
     |- settings.gradle.kts
  |- demos
  |- gradle/libs.versions.toml
  |- libraries
  |- build.gradle.kts
  |- settings.gradle.kts
```

### Root project

#### The `settings.gradle.kts` file

The `settings.gradle.kts` file is our top-level settings file that will define some settings for all our underlying project. Basically it consists of nothing more than:

```kotlin
// <root>/settings.gradle.kts
rootProject.name = "kotlinx"

includeBuild("plugins")
```

This settings file indicates that the `plugins` subproject needs to be added to the so called _composite_ build of the Gradle project. It will be build before any of the other projects that will be included using the regular `include`. This makes sense since it will contain plugins that need to be compiled before they can be used in the future subprojects.

#### The `build.gradle.kts` file

This file will contain any high level build information:

```kotlin
// <root>/build.gradle.kts
subprojects {
    group = "nl.avwie.kotlinx"
    version = "1.0.0-SNAPSHOT"
}
```

This way we have a centralized way of defining the versioning of any libraries we might publish. This might make absolutely no sense if you want to publish separate libraries. In that case just manage it in the respective build files of the subprojects themselves.

### The plugins

Now on to the interesting part of actually making some precompiled script plugins. I want to have the following capabilities exposed as plugins:

- a plugin that defines my standard repositories, including my own Space repository
- a plugin that defines publishing to my own Space repository
- a plugin that sets up a default multiplatform library project with proper repositories and publishing
- a plugin that sets up a default multiplatform Jetbrains Compose project with proper repositories and publishing
- a plugin that sets up a default multiplatforn starter project with sensible defaults dependencies I use a lot
- a plugin that sets up a default multiplatforn starter Jetbrains Compose project with sensible defaults dependencies I use a lot

#### The plugin build

The plugin project requires some setting up, because that is build before anything else and as such needs some dependencies and configuration in order for it to be built correctly.

```kotlin
// <root>/plugins/settings.gradle.kts
dependencyResolutionManagement {
    repositories {
        mavenCentral()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
    }

    versionCatalogs {
        create("libs") {
            from(files("../gradle/libs.versions.toml"))
        }
    }
}
```

As you can see we activate the `versionCatalogs` so we can use it also in the plugin files.

```kotlin
// <root>/plugins/build.gradle.kts
plugins {
    `kotlin-dsl`
}

dependencies {
    implementation(libs.gradle.plugin.jetbrains.kotlin)
    implementation(libs.gradle.plugin.jetbrains.serialization)
    implementation(libs.gradle.plugin.jetbrains.compose)
}
```

We need the dependencies on the plugins here, because we need to apply them in the respective build scripts. Please note that this is different than normally refering to a plugin `id` in a normal build script.

We need those dependencies in our `libs.versions.toml` of course:

```toml
[libraries]
// ....
// ....
# gradle plugins
gradle-plugin-jetbrains-kotlin = { module = "org.jetbrains.kotlin:kotlin-gradle-plugin", version.ref = "jetbrains-kotlin" }
gradle-plugin-jetbrains-serialization = { module = "org.jetbrains.kotlin:kotlin-serialization", version.ref = "jetbrains-kotlin" }
gradle-plugin-jetbrains-compose = { module = "org.jetbrains.compose:compose-gradle-plugin", version.ref = "jetbrains-compose" }
```

#### Repositories convention plugin

```kotlin
// <root>/plugins/src/main/kotlin/convention.repositories.gradle.kts
val spaceUsername: String by project
val spacePassword: String by project

repositories {
    google()
    mavenCentral()
    maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")

    maven {
        url = uri("<REDACTED>")
        credentials {
            username = spaceUsername
            password = spacePassword
        }
    }
}
```

As you can see this simply defines the repositories as you normally would in a normal project.

#### Publishing convention plugin
```kotlin
// <root>/plugins/src/main/kotlin/convention.publishing.gradle.kts
val spaceUsername: String by project
val spacePassword: String by project

plugins {
    `maven-publish`
}

publishing {
    repositories {
        maven {
            url = uri("<REDACTED>")
            credentials {
                username = spaceUsername
                password = spacePassword
            }
        }
    }
}
```

#### Multiplatform library convention plugin
```kotlin
// <root>/plugins/src/main/kotlin/convention.library-multiplatform.gradle.kts
plugins {
    id("convention.repositories")
    id("convention.publishing")
    kotlin("multiplatform")
}

kotlin {
    js(IR) {
        browser()
    }

    jvm()
}
```

As you can see we can refer to the other plugins we defined earlier.

#### Multiplatform Compose library convention plugin
```kotlin
// <root>/plugins/src/main/kotlin/convention.library-multiplatform-compose.gradle.kts
plugins {
    id("convention.library-multiplatform") // we basically extend this one
    id("org.jetbrains.compose")
}

kotlin {
    js(IR) {
        browser()
    }

    jvm()

    sourceSets {
        @Suppress("UNUSED_VARIABLE")
        val commonMain by getting {
            dependencies {
                implementation(compose.runtime)
            }
        }
    }
}
```

So far this all looks pretty straightforward! Let's look at a starter project:

#### Multiplatform starter project

```kotlin
// <root>/plugins/src/main/kotlin/starter.multiplatform.gradle.kts

val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")

plugins {
    id("convention.repositories")
    kotlin("multiplatform")
    kotlin("plugin.serialization")
}

kotlin {

  js(IR) {
      browser()
      binaries.executable()
  }

  jvm {
      withJava()
  }


  @Suppress("UNUSED_VARIABLE")
  sourceSets {
      val commonMain by getting {
          dependencies {
              implementation(versionCatalog.findLibrary("jetbrains.coroutines.core").get())
              implementation(versionCatalog.findLibrary("jetbrains.datetime").get())
              implementation(versionCatalog.findLibrary("jetbrains.serialization.json").get())
              implementation(versionCatalog.findLibrary("jetbrains.collections.immutable").get())

              implementation(versionCatalog.findLibrary("uuid").get())
              implementation(versionCatalog.findLibrary("kodein-di-core").get())
              implementation(versionCatalog.findLibrary("flowext").get())
          }
      }
  }
}
```

Here you see we access the version catalog using the non-typesafe way. We apply the multiplatform and serialization plugins and add some libraries I use a _lot_.

#### Multiplatform Compose starter plugin

```kotlin
// <root>/plugins/src/main/kotlin/starter.multiplatform-compose.gradle.kts
import gradle.kotlin.dsl.accessors._2ac8a54cb38e450fac76afa89d97da17.compose
import org.gradle.kotlin.dsl.getValue
import org.gradle.kotlin.dsl.getting

val versionCatalog = extensions.getByType<VersionCatalogsExtension>().named("libs")

plugins {
    id("starter.multiplatform")
    id("org.jetbrains.compose")
}

kotlin {

    @Suppress("UNUSED_VARIABLE")
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(compose.runtime)
                implementation(versionCatalog.findLibrary("kodein-di-compose").get())
            }
        }

        val jvmMain by getting {
            dependencies {
                implementation(compose.desktop.currentOs) {
                    exclude(group = "org.jetbrains.compose.material", module = "material")
                    exclude(group = "org.jetbrains.compose.material3", module = "material3")
                }

                implementation(versionCatalog.findLibrary("jetbrains.coroutines.swing").get())
            }
        }

        val jsMain by getting {
            dependencies {
                implementation(compose.web.core)
                implementation(compose.web.svg)
                implementation(compose.runtime)
            }
        }
    }
}

```

These are all the plugins! 

## Using the plugins

I am creating a very basic demo project where I simulate some bouncing balls by creating a project in `demos/simulation` and adding a `build.gradle.kts`. I include the project in the root `settings.gradle.kts`.

```kotlin
// <root>/settings.gradle.kts
rootProject.name = "kotlinx"

includeBuild("plugins")
include(":demos:simulation")
```

```kotlin
// <root>/demos/simulation/build.gradle.kts
plugins {
    id("starter.multiplatform-compose")
    `application`
}

kotlin {
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(project(":libraries:ui")) 
                implementation(project(":libraries:ui-compose"))
            }
        }
    }
}

application {
    mainClass.set("AppKt")
}
```

As you can see I include the `starter.multiplatform-compose` plugin, and some minor additional stuff. And it just works! Easy-peasy setup for me to create simple demos in both JVM and JS.

## Acknowledgements

I have to be fair, it took me a while to get here and I had to ask a _lot_, like really a _lot_, of questions in the Kotlin Slack channel. So most credits go out to the people there, and most notably:

- Adam S
- Björn Kautler
- PoisenedYouth

So this blog post is more a culmination of them saying whay I should do. Nevertheless, other people might benefit.

Adam S. also had some very specific notions on how to do this and this solution differs a lot. So I'd suggest to join the Kotlin Slack and ask in `#gradle` any specific questions.

## Conclusion

This was a very short blog post, more a brain-dump to be honest. However, I learned a lot again. The final code is be viewed here:

https://github.com/avwie/kotlinx/tree/blog/gradle-setup-with-convention-plugins