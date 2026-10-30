# tv-enabler rules
- TV Enabler discovery identifies Fire TVs from local DIAL/UPnP manufacturer/model metadata independently of ADB reachability, holds a multicast lock during scanning, and requires explicit selection; TCP-only reachability never authenticates or enables a TV, so devices with closed debugging remain discoverable without side effects.
