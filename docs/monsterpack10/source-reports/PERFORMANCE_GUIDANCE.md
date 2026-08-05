# Performance Guidance

> Actual safe horde counts must be measured after integration into the target game.

Draw calls are conservative asset-level estimates based on imported mesh and material counts, not a renderer capture.
A numeric maximum-visible value is intentionally left unclaimed until a target-engine benchmark exists.

| Asset | Variant | KiB | Triangles | Vertices | Materials | Meshes | Bones | Clips | Est. draws | Recommended maximum visible | Recommended role |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Alien-RRliSQBP7r.glb | hero | 702.5 | 7676 | 4245 | 1 | 1 | 43 | 14 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Alien.glb | aggregate | 5.6 | 150 | 108 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Alien.glb | commonFar | 21.2 | 800 | 487 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Alien.glb | commonNear | 113.2 | 2616 | 1430 | 1 | 2 | 4 | 6 | 2 | limited nearby mixers; target-engine benchmark required | near common |
| Alien.glb | hero | 122.9 | 2616 | 1430 | 1 | 2 | 4 | 9 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Alpaking Evolved.glb | hero | 269.3 | 4684 | 3128 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Alpaking.glb | aggregate | 5.3 | 150 | 100 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Alpaking.glb | commonFar | 19.6 | 800 | 434 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Alpaking.glb | commonNear | 144.0 | 2508 | 1308 | 1 | 1 | 13 | 5 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Alpaking.glb | hero | 164.2 | 2508 | 1308 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Armabee Evolved.glb | hero | 199.4 | 3200 | 1916 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Armabee.glb | aggregate | 6.1 | 150 | 126 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Armabee.glb | commonFar | 18.0 | 648 | 412 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Armabee.glb | commonNear | 140.0 | 2280 | 1256 | 1 | 1 | 13 | 5 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Armabee.glb | hero | 160.3 | 2280 | 1256 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Birb.glb | hero | 161.9 | 3164 | 2173 | 1 | 1 | 4 | 9 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Blue Demon.glb | hero | 660.8 | 5798 | 3247 | 1 | 1 | 43 | 15 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Bunny.glb | hero | 795.9 | 8282 | 4583 | 1 | 2 | 49 | 14 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Cactoro-IGn9lhdama.glb | hero | 677.6 | 6398 | 3871 | 1 | 1 | 43 | 14 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Cactoro.glb | aggregate | 7.8 | 150 | 180 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Cactoro.glb | commonFar | 24.8 | 650 | 629 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Cactoro.glb | commonNear | 123.8 | 2388 | 1663 | 1 | 2 | 4 | 6 | 2 | limited nearby mixers; target-engine benchmark required | near common |
| Cactoro.glb | hero | 133.6 | 2388 | 1663 | 1 | 2 | 4 | 9 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Cat.glb | aggregate | 8.2 | 150 | 194 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Cat.glb | commonFar | 24.1 | 650 | 608 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Cat.glb | commonNear | 98.6 | 1772 | 1270 | 1 | 1 | 4 | 6 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Cat.glb | hero | 107.9 | 1772 | 1270 | 1 | 1 | 4 | 9 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Chicken.glb | aggregate | 6.2 | 149 | 129 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Chicken.glb | commonFar | 21.8 | 800 | 507 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Chicken.glb | commonNear | 124.5 | 2904 | 1651 | 1 | 1 | 4 | 6 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Chicken.glb | hero | 133.8 | 2904 | 1651 | 1 | 1 | 4 | 9 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Demon-LnfIziKv4o.glb | hero | 696.6 | 6712 | 4188 | 1 | 2 | 43 | 14 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Demon.glb | hero | 412.7 | 4784 | 2886 | 1 | 3 | 43 | 8 | 3 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Dino.glb | hero | 631.0 | 5414 | 3085 | 1 | 1 | 43 | 14 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Dragon Evolved.glb | hero | 533.1 | 7438 | 4353 | 1 | 1 | 46 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Dragon.glb | hero | 249.8 | 4562 | 2741 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Fish-ypEYhCImAB.glb | hero | 670.9 | 6854 | 3684 | 1 | 1 | 43 | 14 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Fish.glb | hero | 147.4 | 3344 | 1827 | 1 | 3 | 4 | 9 | 3 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Frog.glb | hero | 611.8 | 5016 | 2751 | 1 | 1 | 43 | 14 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Ghost Skull.glb | hero | 356.1 | 3144 | 2411 | 1 | 1 | 38 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Ghost.glb | hero | 323.7 | 3192 | 1768 | 1 | 1 | 38 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Glub Evolved.glb | hero | 232.6 | 4452 | 2426 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Glub.glb | aggregate | 5.7 | 149 | 111 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Glub.glb | commonFar | 20.3 | 800 | 458 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Glub.glb | commonNear | 146.3 | 2528 | 1350 | 1 | 1 | 13 | 5 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Glub.glb | hero | 166.5 | 2528 | 1350 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Goleling Evolved.glb | hero | 302.0 | 5864 | 3631 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Goleling.glb | hero | 219.4 | 3696 | 2252 | 1 | 1 | 13 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Green Blob.glb | aggregate | 5.2 | 149 | 98 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Green Blob.glb | commonFar | 16.3 | 649 | 357 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Green Blob.glb | commonNear | 74.7 | 1520 | 803 | 1 | 2 | 4 | 6 | 2 | limited nearby mixers; target-engine benchmark required | near common |
| Green Blob.glb | hero | 84.0 | 1520 | 803 | 1 | 2 | 4 | 9 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Green Spiky Blob.glb | hero | 198.4 | 4888 | 2671 | 1 | 2 | 4 | 9 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Hywirl.glb | hero | 321.2 | 3296 | 1704 | 1 | 1 | 38 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Monkroose.glb | hero | 650.6 | 5824 | 3385 | 1 | 1 | 43 | 14 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Mushnub Evolved.glb | hero | 155.9 | 3072 | 2008 | 1 | 3 | 4 | 9 | 3 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Mushnub.glb | aggregate | 5.5 | 150 | 105 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Mushnub.glb | commonFar | 13.1 | 500 | 284 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Mushnub.glb | commonNear | 65.6 | 1248 | 678 | 1 | 1 | 4 | 6 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Mushnub.glb | hero | 74.9 | 1248 | 678 | 1 | 1 | 4 | 9 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Mushroom King.glb | hero | 652.9 | 6044 | 3396 | 1 | 2 | 43 | 14 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Ninja-xGYmeDpfTu.glb | hero | 670.7 | 5964 | 3782 | 1 | 1 | 43 | 14 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Ninja.glb | aggregate | 6.6 | 150 | 141 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Ninja.glb | commonFar | 20.2 | 650 | 482 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Ninja.glb | commonNear | 103.8 | 2160 | 1332 | 1 | 1 | 4 | 6 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Ninja.glb | hero | 113.2 | 2160 | 1332 | 1 | 1 | 4 | 9 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Orc Enemy.glb | aggregate | 10.2 | 149 | 257 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Orc Enemy.glb | commonFar | 28.3 | 650 | 742 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Orc Enemy.glb | commonNear | 127.0 | 2296 | 1771 | 1 | 1 | 4 | 6 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Orc Enemy.glb | hero | 136.4 | 2296 | 1771 | 1 | 1 | 4 | 9 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Orc.glb | hero | 710.7 | 7344 | 4385 | 1 | 2 | 43 | 14 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Pigeon.glb | aggregate | 6.0 | 150 | 122 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Pigeon.glb | commonFar | 17.5 | 650 | 396 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Pigeon.glb | commonNear | 98.7 | 2184 | 1229 | 1 | 1 | 4 | 6 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Pigeon.glb | hero | 108.1 | 2184 | 1229 | 1 | 1 | 4 | 9 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Pink Blob.glb | aggregate | 5.6 | 150 | 108 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Pink Blob.glb | commonFar | 13.5 | 500 | 296 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Pink Blob.glb | commonNear | 60.4 | 1030 | 581 | 1 | 2 | 4 | 6 | 2 | limited nearby mixers; target-engine benchmark required | near common |
| Pink Blob.glb | hero | 69.7 | 1030 | 581 | 1 | 2 | 4 | 9 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Squidle.glb | hero | 408.2 | 4880 | 2790 | 1 | 1 | 43 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Tribal.glb | hero | 422.8 | 5252 | 3500 | 1 | 1 | 38 | 8 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Wizard.glb | aggregate | 7.0 | 150 | 153 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Wizard.glb | commonFar | 20.5 | 650 | 493 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Wizard.glb | commonNear | 88.1 | 1674 | 1050 | 1 | 2 | 4 | 6 | 2 | limited nearby mixers; target-engine benchmark required | near common |
| Wizard.glb | hero | 97.4 | 1674 | 1050 | 1 | 2 | 4 | 9 | 2 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Yeti-ceRHrn8HHE.glb | hero | 650.8 | 6094 | 3355 | 1 | 1 | 43 | 14 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
| Yeti.glb | aggregate | 8.1 | 150 | 188 | 1 | 1 | 0 | 0 | 1 | large distant groups; target-engine benchmark required | aggregate crowd proxy |
| Yeti.glb | commonFar | 21.7 | 649 | 531 | 1 | 1 | 0 | 0 | 1 | potentially hundreds; target-engine benchmark required | distant common |
| Yeti.glb | commonNear | 107.9 | 2136 | 1410 | 1 | 1 | 4 | 6 | 1 | limited nearby mixers; target-engine benchmark required | near common |
| Yeti.glb | hero | 117.2 | 2136 | 1410 | 1 | 1 | 4 | 9 | 1 | small active count; target-engine benchmark required | elite, boss, specialist, or quality reference |
