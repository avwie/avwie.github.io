---
slug: "/mandelbrot-in-compose-multiplatform"
date: "2022-10-14"
title: "Building a Mandelbrot viewer in Compose Multiplatform"
---

I decided to experiment with Compose Multiplatform, the declarative UI framework, even though I hardly know Compose. Since I am not an Android developer it was a bit confusing to get started with, because there are multiple artifacts that are called 'Compose'. This is related to the origin of Compose. 

As far as I understand it it is as follows: JetPack Compose is the declarative UI toolkit being developed by the Google Android team. This consists of a few components:

- The Compose Runtime, which is the core of Compose and is not specifically related to UI's. It is a very novel way of working with tree structures that mutate over time. And since UI's can be modelled as trees this is a nice fit.
- Compose UI, the layer which sits on top of the runtime and contains the UI building blocks
- Compose Material, the Material Design implementation in Compose UI

However, Jetbrains (not affiliated at all with JetPack) identified that the Compose Runtime is not at all bound to the Android platform and forked it, resulting in:

- Compose Multiplatform, the runtime and the building blocks for using Compose Runtime in Kotlin Multiplatform Common code
- Compose for Desktop, contains Compose UI and Compose Material implementations for the JVM
- Compose for Web, contains a Compose implementation for the DOM, which allows you to write Composables for the Web

More can be found here: [Compose Multiplatform](https://www.jetbrains.com/lp/compose-mpp/)

However.... there is also an experimental directory in their repository: [https://github.com/JetBrains/compose-jb/tree/master/experimental](https://github.com/JetBrains/compose-jb/tree/master/experimental). And that one contains very interesting examples. It appears that they are experimenting with making it possible to reuse Compose UI and Compose Material across all platforms. This includes JVM, Native desktop targets, iOS targets, and a Web target via HTML Canvas.

Together with my idea to test coroutines for calculating solutions to [embarrassingly parallel](https://en.wikipedia.org/wiki/Embarrassingly_parallel) problems I had a nice small coding target. I wanted to make a Mandelbrot Viewer in Kotlin Compose Multiplatform, making it work in the most amount of platforms available with only common code.

## Mandelbrot calculation

Much has been said about the Mandelbrot and I am not going to rehash that here. It is a very well described problem and I will only be showing the implementation. 

The core algorithm is pretty simple:

```kotlin
fun mandelbrot(cx0: Double, cy0: Double, limit: Int): Int {
    var i = 0;
    var (xn, yn) = 0.0 to 0.0

    var xtemp: Double
    var ytemp: Double;
    while (xn * xn + yn * yn < 4 && i < limit) {
        xtemp = xn * xn - yn * yn
        ytemp = 2 * xn * yn
        xn = xtemp + cx0
        yn = ytemp + cy0
        i++
    }
    return i;
}
```

Here `cx0` and `cy0` are the starting points in the complex plane (`cx0 + i * cxy0`) which is used as the input. The `limit` is the amount of iteratons until the algorithm decides the starting point is part of the Mandelbrot set.

Since this is only 1 pixel we need to expand it to a full map. I'll use a simple datastructure for that:

```kotlin
class MandelbrotMap(
    val options: Options,
    private val buffer: IntArray
) {
    data class Options(
        val xMin: Double,
        val xMax: Double,
        val xRes: Int,
        val yMin: Double,
        val yMax: Double,
        val yRes: Int,
        val limit: Int = 128
    )
}
```

The `buffer` is a flat array which will contain the results from the calculations for the complete viewport, which is described by the `Options` data structure. To calculate the Map we use the following routine:

```kotlin
suspend fun run(options: Options, parallel: Boolean) = coroutineScope {
    val buffer = IntArray(options.xRes * options.yRes) { 0 }
    (0 until options.yRes).forEach { y ->
        val block : () -> Unit = {
            (0 until options.xRes).forEach { x ->
                val cx0 = options.xMin + x * options.deltaX
                val cy0 = options.yMin + y * options.deltaY
                buffer[y * options.xRes + x] = mandelbrot(cx0, cy0, options.limit)
            }
        }
        if (parallel) launch { block() }
        else block()
    }
    MandelbrotMap(options, buffer)
}
```

This is where the parallelization happens. I have a parameter called `parallel` which decides whether or not we split the work. Currently I decided to launch a coroutine for every row. This is completely arbitrary. Since this algorithm is embarrassingly parallel, we don't need to worry about shared mutable state. Every pixel writes in its own index in the buffer. Please note that we defer the context of the coroutine to the caller of this function.

## Mandelbrot plotting

Now we have a linear array of integer values which is not very pleasing to the eye. So we need to convert it to a bitmap. Since I want to use it in Compose I figured I needed to render it inside a `Canvas` which contains a `drawImage` function. This `drawImage` function requires a `androidx.compose.ui.graphics.ImageBitmap`. But I found no way to implement such an `ImageBitmap` interface. However, with the help from the Kotli Slack channel I learned that we can use a `org.jetbrains.skia.Bitmap` and leverage the extension function `toComposeImageBitmap` on that class to transform it. 

Now I only needed to find out how to make a `Bitmap`. After scouring Slack and diving into the code of [Kirill Grouchnikov](https://github.com/kirill-grouchnikov) I managed to create a Skia Bitmap using a nice helper function:

```kotlin
interface BitmapBuilderScope {
    operator fun set(index: Int, color: Color)
    operator fun set(x: Int, y: Int, color: Color)
}

fun buildBitmap(width: Int, height: Int, block: BitmapBuilderScope.() -> Unit = {}): Bitmap {
    val builder = BitmapBuilder(width, height)
    block(builder)
    return builder.build()
}

class BitmapBuilder(private val width: Int, private val height: Int): BitmapBuilderScope {
    private val bytes = ByteArray(width * height * ColorType.RGBA_8888.bytesPerPixel)

    override fun set(index: Int, color: Color) {
        bytes[index * ColorType.RGBA_8888.bytesPerPixel + 0] = (color.red * 255).toInt().toByte()
        bytes[index * ColorType.RGBA_8888.bytesPerPixel + 1] = (color.green * 255).toInt().toByte()
        bytes[index * ColorType.RGBA_8888.bytesPerPixel + 2] = (color.blue * 255).toInt().toByte()
        bytes[index * ColorType.RGBA_8888.bytesPerPixel + 3] = (255).toByte()
    }

    override operator fun set(x: Int, y: Int, color: Color) {
        require(x in 0 until width)
        require(y in 0 until height)
        val index = y * width + x
        set(index, color)
    }

    fun build(): Bitmap {
        val bitmap = Bitmap()
        val info = ImageInfo(
            colorInfo = ColorInfo(
                colorType = ColorType.RGBA_8888,
                alphaType = ColorAlphaType.PREMUL,
                colorSpace = ColorSpace.sRGB
            ),
            width = width,
            height = height
        )
        bitmap.allocPixels(info)
        bitmap.installPixels(bytes)
        return bitmap
    }
}
```

And rendering the Mandelbrot buffer becomes trivial now;

```kotlin
fun asBitmap(colorMap: ColorMap): Bitmap = buildBitmap(width, height) {
    val min = buffer.minOrNull() ?: 0
    val max = buffer.maxOrNull()?.plus(1) ?: options.limit

    // precalcualte the color map values
    val colors = (0 .. (max - min)).map { colorMap[(it.toFloat() / (max - min)).pow(0.5f)] }.toTypedArray()

    this@MandelbrotMap.buffer.forEachIndexed { index,  value ->
        val color = when (value) {
            options.limit -> Color.Black
            else -> colors[value - min]
        }
        this[index] = color
    }
}
```

As you can see we need a `ColorMap`, which is defined as:
```kotlin
fun interface ColorMap {
    operator fun get(value: Float): Color
}
```

The implementation is in my repository, but not important for this post.

## Building the ViewModel

I like to work with ViewModels. They contain all the interactions and all the important state-handling so the view itself can just to the thing it is meant to... creating a view.

The whole viewmodel is written as:

```kotlin
class MandelbrotViewerModel(scope: CoroutineScope) {

    private var currentCalculationJob : Job = Job()
    private var minResolution = 1

    private val viewPorts = MutableStateFlow(
        Viewport(
            width = 1,
            height = 1,
            x = -1.141,
            y = -0.2678,
            xScale = 0.1
        )
    )

    private val limits = MutableStateFlow(512)
    private val parallel = MutableStateFlow(true)
    private val colorMaps = MutableStateFlow(ColorMap.Plasma)
    private val mandelbrots = MutableStateFlow(MandelbrotMap.UNIT);

    private val options = combine(viewPorts, limits) { viewPort: Viewport, limit: Int ->
        MandelbrotMap.Options.fromViewport(viewPort, limit)
    }

    val bitmaps = combine(mandelbrots, colorMaps) { mandelbrot, colorMap -> mandelbrot.asBitmap(colorMap) }

    init {
        scope.launch(Dispatchers.Default) { // here we offload the calculations to the Default dispatcher
            combine(options, parallel) { options: MandelbrotMap.Options, parallel: Boolean ->
                calculateMandelbrotMaps(options, parallel, resolutions = listOf(64, 4, minResolution))
            }.collect()
        }
    }

    fun updateColorMap(colorMap: ColorMap) {
        this.colorMaps.update { colorMap }
    }

    fun updateSize(size: IntSize) {
        this.viewPorts.update { it.copy(width = size.width, height = size.height) }
    }

    fun updatePosition(offset: Offset) {
        this.viewPorts.update { viewPort ->
            val (x, y) = MandelbrotMap.Options
                .fromViewport(viewPort, limits.value)
                .convertScreenCoordinates(offset.x, offset.y)
            viewPort.copy(x = x, y = y)
        }
    }

    fun zoom(amount: Float) {
        this.viewPorts.update { viewPort -> viewPort.copy(xScale = viewPort.xScale * amount) }
    }

    fun setParallel(parallel: Boolean) {
        this.parallel.update { parallel }
    }

    fun setMinResolution(resolution: Int) {
        minResolution = resolution
    }

    private suspend fun calculateMandelbrotMaps(options: MandelbrotMap.Options, parallel: Boolean, resolutions: List<Int>) = coroutineScope {
        // this can probably be done nicer, but don't know how atm.
        // the idea is to cancel any running calculations when the inputs change
        currentCalculationJob.cancel()
        currentCalculationJob = launch {
            resolutions.forEach { resolution ->
                mandelbrots.update {
                    MandelbrotMap.run(options.withResolution(resolution), parallel)
                }
            }
        }
    }
}
```

I like to refrain from using any Compose states in the view models, and only rely on `StateFlow` for states and `Flow` for derived states. The exposed functions modify the inputs for the calculations of the maps and on any change of the input parameters the `mandelbrots` StateFlow is updated with the latest `MandelbrotMap`. The `bitmaps` Flow is a simple mapping of `MandelbrotMap` to `Bitmap`.

Another interesting trick is that I calculate the Mandelbrot with increased resolutions. This means that when navigating to the Mandelbrot you get a coarse low-res view fast, and a high-res view later. 

## Building the Compose View

Now is the interesting part. We are making a view in `common` only code. This required some `gradle.kts` dependencies:

```kotlin
plugins {
    kotlin("multiplatform") version "1.7.10"
    id("org.jetbrains.compose") version "1.2.0"
}

kotlin {
    /* ... */
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.6.4")
                implementation("org.jetbrains.skiko:skiko:0.7.35")
                implementation(compose.runtime)
                implementation(compose.material)
            }
        }
    }
    /* ... */
}
```

We start with the main app:

```kotlin
@Composable fun MandelbrotApp() {
    val scope = rememberCoroutineScope()
    val model = remember { MandelbrotViewerModel(scope) }
    MaterialTheme {
        MandelbrotViewer(model = model)
    }
}
```

The viewer is defined like this:
```kotlin
@Composable fun MandelbrotViewer(model: MandelbrotViewerModel) {
    val requester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        requester.requestFocus()
    }

    Box {
        MandelbrotPlot(requester, model)

        Box(modifier = Modifier.align(Alignment.BottomCenter)) {
            MandelbrotControls(requester, model)
        }
    }
}
```

We need the `requester` there to bring back focus to the canvas in the plot part. 

The `MandelbrotControls` are not that interesting and can be viewed in the Github repo, however the `MandelbrotPlot` is interesting and is defined as follows:
```kotlin
@OptIn(ExperimentalComposeUiApi::class)
@Composable fun MandelbrotPlot(
    requester: FocusRequester,
    model: MandelbrotViewerModel
) {
    val bitmap by model.bitmaps.collectAsState(EMPTY_BITMAP)
    val minResolution = LocalDensity.current.density.toInt()

    LaunchedEffect(minResolution) {
        model.setMinResolution(minResolution)
    }

    Canvas(modifier = Modifier
        .fillMaxSize()
        .focusRequester(requester)
        .focusable()
        .onPointerEvent(PointerEventType.Release) {
            val position = it.changes.first().position
            requester.requestFocus()
            model.updatePosition(position)
        }
        .onKeyEvent {
            when {
                it.type != KeyEventType.KeyUp -> false
                it.key == Key.DirectionUp -> {
                    model.zoom(0.5f); true
                }
                it.key == Key.DirectionDown -> {
                    model.zoom(2.0f); true
                }
                else -> false
            }
        }
        .onSizeChanged { size -> model.updateSize(size) }
    ) {
        drawImage(
            image = bitmap.asComposeImageBitmap(),
            dstSize = IntSize(size.width.toInt(), size.height.toInt())
        )
    }
}
```

As can be seen this is pretty straightforward! I handle some UI events and I set the minimum resolution to the LocalDensitity.

## Launching it on JVM, JS and iOS

Looking at the examples in the experimental folder of Jetbrains I decided to copy/paste most of the `gradle` configuration. However there were some issues:

- Kotlin 1.7.20 contains the new native memory model, but the JS part doesn't compile. So I needed to set some properties in the gradle.properties file
- I can't get Arm64 targets working, I think because they aren't supported yet

Since this is highly experimental I am okay with that.

However, after some tinkering I managed to get it working on JVM, JS, and iPad!

<video controls width="100%">
    <source src="/movies/mandelbrot.mp4" type="video/mp4">
</video>

## Conclusion

This was very fun to do and it amazed me how far I got. The Slack channel of Kotlin was amazingly helpful once again.
Seeing as it is highly experimental it really shows it has a lot of potential.

I can't understate how awesome it would be to have shared UI code across platforms. Granted, there are big differences between platforms, so you probably need to do platform-specific modifications. However, it would be awesome if this can be done from the comfort of Kotlin code.

The code for the repository can be found here: https://github.com/avwie/mandelbrot-compose-multiplatform
Please let me know on Github if you have any questions!