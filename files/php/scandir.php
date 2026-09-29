<?php
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(403);
    exit;
}

const ALLOWED_HOSTS = ['launchermodded.phe-go.com', 'localhost', '127.0.0.1'];
const FORCE_HTTPS = true;
const INSTANCE_NAME_REGEX = '/^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/';

function jsonOutput($data) {
    return json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

function baseUrl() {
    $host = strtolower($_SERVER['HTTP_HOST'] ?? '');
    if (!in_array($host, ALLOWED_HOSTS, true)) $host = ALLOWED_HOSTS[0];

    $https = FORCE_HTTPS || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return ($https ? 'https' : 'http') . '://' . $host . $scriptDir;
}

function encodePath($path) {
    return implode('/', array_map('rawurlencode', explode('/', $path)));
}

function scanAllDir($dir) {
    $result = [];
    $files = @scandir($dir);
    if ($files === false) return $result;
    foreach($files as $filename) {
        if ($filename[0] === '.') continue;
        $filePath = $dir . '/' . $filename;
        if (is_link($filePath)) continue;
        if (is_dir($filePath)) {
            foreach (scanAllDir($filePath) as $childFilename) {
                $result[] = $filename . '/' . $childFilename;
            }
        } else {
            $result[] = $filename;
        }
    }
    return $result;
}

function scanFolder($dir) {
    $result = [];
    $files = @scandir($dir);
    if ($files === false) return $result;
    foreach($files as $filename) {
        if ($filename[0] === '.') continue;
        $filePath = $dir . '/' . $filename;
        if ($filename == "php") continue;
        if (!preg_match(INSTANCE_NAME_REGEX, $filename)) continue;
        if (is_dir($filePath) && !is_link($filePath)) $result[] = $filename;

    }
    return $result;
}

function dirToArray($dir) {
    $res = [];
    $root = realpath($dir);
    if ($root === false || !is_dir($root)) return jsonOutput($res);

    $cacheFile = sys_get_temp_dir() . '/phenix-files-' . sha1($root) . '.cache';
    $cache = is_file($cacheFile) ? @unserialize((string) @file_get_contents($cacheFile), ['allowed_classes' => false]) : [];
    if (!is_array($cache)) $cache = [];
    $newCache = [];

    $baseUrl = baseUrl() . '/' . encodePath($dir) . '/';
    $cdir = scanAllDir($dir);
    foreach ($cdir as $key => $value) {
        $file = $root . DIRECTORY_SEPARATOR . $value;
        $real = realpath($file);
        if ($real === false || strpos($real, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($real)) continue;

        $size = filesize($real);
        $stamp = $size . ':' . filemtime($real);
        $hash = (isset($cache[$value]) && $cache[$value][0] === $stamp) ? $cache[$value][1] : hash_file('sha1', $real);
        $newCache[$value] = [$stamp, $hash];
        $path = $value;

        $url = $baseUrl . encodePath($path);
        $res[] = array("url" => $url, "size" => $size, "hash" => $hash, "path" => $path);
    }

    if ($newCache !== $cache) @file_put_contents($cacheFile, serialize($newCache), LOCK_EX);
    return jsonOutput($res);
}
?>
