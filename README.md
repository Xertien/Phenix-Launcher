<h1>Files server</h1>

## Instances

Each instance is declared in `files/php/instances.php` and merged into the JSON returned by `files/`.

| Key | Required | Description |
|---|---|---|
| `loadder` | yes | `minecraft_version`, `loadder_type` (`forge`, `neoforge`, `fabric`...), `loadder_version` |
| `verify` | yes | Delete files that are not on the server |
| `ignored` | yes | Paths never verified nor deleted |
| `whitelist` / `whitelistActive` | yes | Restrict the instance to some players |
| `status` | yes | `nameServer`, `ip`, `port` used for the server status and ping |
| `ram` | no | Recommended memory in GB: `min` and `max` (0.5 to 64, `min` <= `max`). Applied automatically by the launcher after the first install of the instance. Omit it if the instance has no recommendation. |

Example:

```php
"ram" => array(
    "min" => 6,
    "max" => 10
)
```
