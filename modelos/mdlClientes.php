<?php
require_once("conexion.php");
class ModeloCliente
{
    public static function mdlGuardarCliente($tabla, $data)
    {
        $stm = conexion::conectar()->prepare("INSERT INTO $tabla (cedula, nombre, apellidos, direccion, telefono, email)
        VALUES(:cedula, :nombre, :apellidos, :direccion, :telefono, :email)");
        $stm->bindParam(':cedula', $data['cedula'], PDO::PARAM_STR);
        $stm->bindParam(':nombre', $data['nombre'], PDO::PARAM_STR);
        $stm->bindParam(':apellidos', $data['apellidos'], PDO::PARAM_STR);
        $stm->bindParam(':direccion', $data['direccion'], PDO::PARAM_STR);
        $stm->bindParam(':telefono', $data['telefono'], PDO::PARAM_STR);
        $stm->bindParam(':email', $data['email'], PDO::PARAM_STR);
        if ($stm->execute())
            return "ok";
        else
            return "error";
    }


    public static function obtenerDatosClientesDb()
    {
        $statement = conexion::conectar()->prepare("SELECT * FROM cliente");
        $statement->execute();
        $data = $statement->fetchAll(PDO::FETCH_OBJ);


        return $data;
    }

    public static function obtenerUnCliente($id) {
        $statement = conexion::conectar()->prepare("SELECT * FROM cliente WHERE id_cliente = :id");
        $statement->bindParam(":id", $id);
        $statement->execute();
        $data = $statement->fetchAll(PDO::FETCH_OBJ);
        return $data;
    }
}
