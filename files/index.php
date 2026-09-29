<?php
ini_set('display_errors', '0');
ini_set('log_errors', '1');

header("Content-Type: application/json; charset=UTF-8");
header("X-Content-Type-Options: nosniff");
include 'php/scandir.php';

$instance_param = $_GET['instance'] ?? 'null';

if (!file_exists('instances')) {
    echo jsonOutput([]);
    exit;
}

$instances_list = scanFolder("instances");

if ($instance_param === 'null') {
    $instance = array();
    foreach ($instances_list as $value) {
        $url = baseUrl() . "/?instance=" . rawurlencode($value);
        $instance[$value] = array("name" => $value, "url" => $url);
    }

    include 'php/instances.php';
    echo jsonOutput($instance);
    exit;
}

if (!is_string($instance_param) || !in_array($instance_param, $instances_list, true)) {
    http_response_code(404);
    echo jsonOutput([]);
    exit;
}

echo dirToArray("instances/$instance_param");
?>
