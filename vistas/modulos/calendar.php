<div class="content-wrapper">
    <!-- Content Header (Page header) -->
    <section class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <h1>Calendar</h1>
                </div>
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-right">
                        <li class="breadcrumb-item"><a href="inicio">Home</a></li>
                        <li class="breadcrumb-item active">Calendar</li>
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
                <button class="btn btn-primary" data-toggle="modal" data-target="#myModal">
                   Calendar 
                </button>


            </div>
            <div class="card-body">
                <div id="myModal" class="modal fade" role="dialog">
                    <div class="modal-dialog">

                        <!-- Modal content-->
                        <div class="modal-content">
                            <div class="modal-header">
                                <h4 class="modal-title">Calendar</h4>
                                <button type="button" class="close" data-dismiss="modal">&times;</button>

                            </div>
                            <div class="modal-body">

                                <div class="card bg-gradient-success">
                                    <div class="card-header border-0">

                                        <h3 class="card-title">
                                            <i class="far fa-calendar-alt"></i>
                                            Calendar
                                        </h3>
                                        <!-- tools card -->
                                        <div class="card-tools">
                                            <!-- button with a dropdown -->
                                            <div class="btn-group">
                                                <button type="button" class="btn btn-success btn-sm dropdown-toggle" data-toggle="dropdown" data-offset="-52">
                                                    <i class="fas fa-bars"></i>
                                                </button>
                                                <div class="dropdown-menu" role="menu">
                                                    <a href="#" class="dropdown-item">Add new event</a>
                                                    <a href="#" class="dropdown-item">Clear events</a>
                                                    <div class="dropdown-divider"></div>
                                                    <a href="#" class="dropdown-item">View calendar</a>
                                                </div>
                                            </div>
                                            <button type="button" class="btn btn-success btn-sm" data-card-widget="collapse">
                                                <i class="fas fa-minus"></i>
                                            </button>
                                            <button type="button" class="btn btn-success btn-sm" data-card-widget="remove">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                        <!-- /. tools -->
                                    </div>
                                    <!-- /.card-header -->
                                    <div class="card-body pt-0">
                                        <!--The calendar -->
                                        <div id="calendar" style="width: 100%"></div>
                                    </div>
                                    <!-- /.card-body -->
                                </div>




                            </div>

                        </div>

                    </div>

                </div>
            </div>
            <!-- /.Tabla de clientes -->


            <!-- /.card-footer-->
        </div>
        <!-- /.card -->

    </section>

    <!-- /.content -->
</div>