<?php
require_once("modelos/mdlUsuarios.php");
class ControladorUsuario{
    public function ctrlIngresar(){
       
        

        if(isset($_POST['usuario']) && isset($_POST['password'])){
            $username = $_POST['usuario'];
            $password = $_POST['password'];
            $res = ModeloUsuarios::mdlEntrar($username, $password);
            if (isset($res["usuario"]) && 
            $res["usuario"]==$username && 
            isset($res["password"]) &&
            $res["password"] == $password){
                $_SESSION['login'] = 'activa';
                echo "<script>
                Swal.fire(
                    'Good job!',
                    'You clicked the button!',
                    'success'
                  )
							window.location.href='inicio';
						  </script>";
            }else{
                
            }
        }
    }
}