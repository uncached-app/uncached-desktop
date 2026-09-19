## 0.1.1-alpha.11

Three changes, and the first one is a fix worth reading.

Unreal's `Saved` directory is no longer offered for removal. Epic's own
documentation puts autosaves, a project's `.ini` configuration and crash logs
in it, none of which a build brings back, and it had been listed beside
`Intermediate` and `DerivedDataCache`, which do.

Uncached now says how old every cache is, and the list narrows to what nothing
has written to in 30 or 90 days. The age is read during the same pass that
measures the size, so it costs nothing, and it is usually the fact that settles
the decision: last year's build output is an easy yes, yesterday's is not.

Insights opens with the disk itself — capacity, what is used, what is free and,
on a Mac, what the system is holding as purgeable and already counts as used.
It is read from the filesystem rather than from anything this app recorded, and
it is free on every plan, because a Mac reporting a hundred and fifty gigabytes
used against a scan that found seventeen is not a broken scan. Where Full Disk
Access is missing, the section says so and opens the pane that grants it.

More of what fills a developer's disk is found, each path taken from the tool's
own documentation: Unity's package and Asset Store caches, Godot's editor cache
and export templates, Android's system images, Ollama's models, and nvm's and
pyenv's caches and installed versions. Android's emulators and Docker Desktop's
disk image are reported with the command their own tool reclaims them with, and
never touched here — one Docker file holds every image, volume and container,
including images built locally and pushed nowhere.

Each group has its own switch under Settings, Scanning.
