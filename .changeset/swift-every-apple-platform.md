---
"@entelekheia/ref-id": patch
---

The Swift package `RefId` builds on every Apple platform: macOS 13, iOS 16, Mac Catalyst 16, tvOS 16,
watchOS 9 and visionOS 1 onwards, the releases that ship Swift's `Regex`. Its manifest declared macOS alone,
so an iOS or Mac Catalyst app resolving it inherited a deployment target older than `Regex` and failed to
compile. No behaviour changes.
