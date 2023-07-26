<?php
// error_reporting(E_ALL & ~E_NOTICE);

// ini_set('display_errors', 1);
// ini_set('display_startup_errors', 1);



$body = json_decode(file_get_contents('php://input'));
include '../controladores/ctrlClientes.php';
include '../modelos/mdlClientes.php';

if (!empty($body->modificar)) {
    $data = ControladorClientes::obtenerUnCliente(intval($body->id));
    echo json_encode($data);
}
