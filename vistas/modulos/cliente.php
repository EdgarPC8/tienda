<!-- Content Wrapper. Contains page content -->
<div class="content-wrapper">
  <!-- Content Header (Page header) -->
  <section class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1>Administración de clientes</h1>
        </div>
        <div class="col-sm-6">
          <ol class="breadcrumb float-sm-right">
            <li class="breadcrumb-item"><a href="inicio">Home</a></li>
            <li class="breadcrumb-item active">Administración de clientes</li>
          </ol>
        </div>
      </div>
    </div><!-- /.container-fluid -->
  </section>

  <!-- Main content 
    Modal para el ingresode clientes-->
  <section class="content">

    <!-- Default box -->
    <div class="card">
      <div class="card-header">
        <button class="btn btn-primary" data-toggle="modal" data-target="#myModal">Crear Clientes</button>


      </div>
      <div class="card-body">
        <form method="POST">
          <div id="myModal" class="modal fade" role="dialog">
            <div class="modal-dialog">

              <!-- Modal content-->
              <div class="modal-content">
                <div class="modal-header">
                  <h4 class="modal-title">Crear Clientes</h4>
                  <button type="button" class="close" data-dismiss="modal">&times;</button>

                </div>
                <div class="modal-body">
                  <div class="input-group mb-3">
                    <input type="text" class="form-control" placeholder="Cédula de identidad" name="cedula" id="cedula"
                      required>
                    <div class="input-group-prepend">
                      <span class="input-group-text"><i class="fas fa-user"></i></span>
                    </div>
                  </div>
                  <div class="input-group mb-3">
                    <input type="text" class="form-control" placeholder="Nombres completos" name="nombre" id="nombre"
                      required>
                    <div class="input-group-prepend">
                      <span class="input-group-text"><i class="fas fa-user"></i></span>
                    </div>
                    <input type="text" class="form-control" placeholder="Apelidos completos" name="apellido"
                      id="apellido" required>
                    <div class="input-group-prepend">
                      <span class="input-group-text"><i class="fas fa-user"></i></span>
                    </div>
                  </div>
                  <div class="input-group mb-3">
                    <input type="text" class="form-control" placeholder="Direccion" name="direccion" id="direccion"
                      required>
                    <div class="input-group-prepend">
                      <span class="input-group-text"><i class="fas fa-route"></i></span>
                    </div>
                    <input type="text" class="form-control" placeholder="Telefono" name="telefono" id="telefono"
                      required>
                    <div class="input-group-prepend">
                      <span class="input-group-text"><i class="fas fa-phone"></i></span>
                    </div>
                  </div>
                  <div class="input-group mb-3">
                    <input type="email" class="form-control" placeholder="Email" name="correo" id="correo" required>
                    <div class="input-group-prepend">
                      <span class="input-group-text"><i class="fas fa-envelope"></i></span>
                    </div>
                  </div>
                </div>
                <div class="modal-footer">
                  <button type="submit" class="btn btn-primary">Guardar Datos</button>
                  <button type="button" class="btn btn-danger" data-dismiss="modal">Cerrar</button>
                  <?php
                  $objUsuario = new ControladorClientes();
                  $objUsuario->crtlGuardarCliente();
                  ?>
                </div>
              </div>

            </div>

          </div>
        </form>
      </div>
      <!-- /.Tabla de clientes -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">DataTable with default features</h3>
        </div>
        <!-- /.card-header -->
        <div class="card-body">
          <table id="tabla_clientes" class="table table-bordered table-striped">

            <?php

            // $clientes = (object) ControladorClientes::obtenerDatosClientes();
            $clientes = ControladorClientes::obtenerDatosClientes();
            $columns = ["cedula", "nombre", "apellidos", "email"];

            ?>
            <thead>
              <tr>
                <?php foreach ($columns as $column): ?>
                  <th>
                    <?= $column ?>
                  </th>
                <?php endforeach ?>
              </tr>
            </thead>

            <tbody>

              <?php foreach ($clientes as $cliente): ?>
                <tr>
                  <td>
                    <?= $cliente->cedula ?>
                  </td>
                  <td>
                    <?= $cliente->nombre ?>
                  </td>
                  <td>
                    <?= $cliente->apellidos ?>
                  </td>
                  <td>
                    <?= $cliente->email ?>
                  </td>
                  <td>
                    <button class="btn btn-warning btn_modificar" data-id-cliente="<?= $cliente->id_cliente ?>" data-toggle="modal" data-target="#modificar">Editar</button>
                    <button type="button" class="btn btn-danger">Eliminar</button>
                  </td>
                </tr>
              <?php endforeach ?>
            </tbody>

            <tfoot>
              <tr>
                <?php foreach ($columns as $column): ?>
                  <th>
                    <?= $column ?>
                  </th>


                <?php endforeach ?>
              </tr>
            </tfoot>


          </table>
        </div>
      </div>

    </div>


    <form method="POST">
      <div id="modificar" class="modal fade" role="dialog">
        <div class="modal-dialog">

          <!-- Modal content-->
          <div class="modal-content">
            <div class="modal-header">
              <h4 class="modal-title">Crear Clientes</h4>
              <button type="button" class="close" data-dismiss="modal">&times;</button>

            </div>
            <div class="modal-body">
              <div class="input-group mb-3">
                <input type="text" class="form-control" placeholder="Cédula de identidad" name="cedula" id="cedula"
                  required>
                <div class="input-group-prepend">
                  <span class="input-group-text"><i class="fas fa-user"></i></span>
                </div>
              </div>
              <div class="input-group mb-3">
                <input type="text" class="form-control" placeholder="Nombres completos" name="nombre" id="nombre"
                  required>
                <div class="input-group-prepend">
                  <span class="input-group-text"><i class="fas fa-user"></i></span>
                </div>
                <input type="text" class="form-control" placeholder="Apelidos completos" name="apellido" id="apellido"
                  required>
                <div class="input-group-prepend">
                  <span class="input-group-text"><i class="fas fa-user"></i></span>
                </div>
              </div>
              <div class="input-group mb-3">
                <input type="text" class="form-control" placeholder="Direccion" name="direccion" id="direccion"
                  required>
                <div class="input-group-prepend">
                  <span class="input-group-text"><i class="fas fa-route"></i></span>
                </div>
                <input type="text" class="form-control" placeholder="Telefono" name="telefono" id="telefono" required>
                <div class="input-group-prepend">
                  <span class="input-group-text"><i class="fas fa-phone"></i></span>
                </div>
              </div>
              <div class="input-group mb-3">
                <input type="email" class="form-control" placeholder="Email" name="correo" id="correo" required>
                <div class="input-group-prepend">
                  <span class="input-group-text"><i class="fas fa-envelope"></i></span>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="submit" class="btn btn-primary">Guardar Datos</button>
              <button type="button" class="btn btn-danger" data-dismiss="modal">Cerrar</button>
              <?php
              $objUsuario = new ControladorClientes();
              $objUsuario->crtlGuardarCliente();
              ?>
            </div>
          </div>

        </div>

      </div>
    </form>




  </section>

  <!-- /.content -->
</div>
<!-- /.content-wrapper -->