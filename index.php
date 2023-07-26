<?php
include_once "controladores/ctrlPrincipal.php";
include_once "controladores/ctrlUsuarios.php";
include_once "controladores/ctrlClientes.php";

include_once "modelos/mdlClientes.php";

$objPrincipal = new ControladorPrincipal();
$objPrincipal ->clrtlPrincipal();