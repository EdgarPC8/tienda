<div class="content-wrapper">
    <!-- Content Header (Page header) -->
    <section class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <h1>Latest Members</h1>
                </div>
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-right">
                        <li class="breadcrumb-item"><a href="inicio">Home</a></li>
                        <li class="breadcrumb-item active">Latest Members</li>
                    </ol>
                </div>
            </div>
        </div><!-- /.container-fluid -->
    </section>

    <!-- Main content 
    Modal para el ingresode clientes-->
    <section class="content">


        <!-- Map card -->
        <div class="card bg-gradient-primary">
            <div class="card-header border-0">
                <h3 class="card-title">
                    <i class="fas fa-map-marker-alt mr-1"></i>
                    Visitors
                </h3>
                <!-- card tools -->
                <div class="card-tools">
                    <button type="button" class="btn btn-primary btn-sm daterange" title="Date range">
                        <i class="far fa-calendar-alt"></i>
                    </button>
                    <button type="button" class="btn btn-primary btn-sm" data-card-widget="collapse" title="Collapse">
                        <i class="fas fa-minus"></i>
                    </button>
                </div>
                <!-- /.card-tools -->
            </div>
            <div class="card-body">
                <div id="world-map" style="height: 250px; width: 100%;"></div>
            </div>
            <!-- /.card-body-->
            <div class="card-footer bg-transparent">
                <div class="row">
                    <div class="col-4 text-center">
                        <div id="sparkline-1"></div>
                        <div class="text-white">Visitors</div>
                    </div>
                    <!-- ./col -->
                    <div class="col-4 text-center">
                        <div id="sparkline-2"></div>
                        <div class="text-white">Online</div>
                    </div>
                    <!-- ./col -->
                    <div class="col-4 text-center">
                        <div id="sparkline-3"></div>
                        <div class="text-white">Sales</div>
                    </div>
                    <!-- ./col -->
                </div>
                <!-- /.row -->
            </div>
        </div>


        <!-- Default box -->
        <div class="card">
            <div class="card-header">
                <button class="btn btn-primary" data-toggle="modal" data-target="#myModal">
                    Lates Members
                </button>


            </div>
            <div class="card-body">
                <div id="myModal" class="modal fade" role="dialog">
                    <div class="modal-dialog">

                        <!-- Modal content-->
                        <div class="modal-content">
                            <div class="modal-header">
                                <h4 class="modal-title">Latest Members</h4>
                                <button type="button" class="close" data-dismiss="modal">&times;</button>

                            </div>
                            <div class="modal-body">
                                No se muestra en el modal

                                <!-- Map card -->
                                <div class="card bg-gradient-primary">
                                    <div class="card-header border-0">
                                        <h3 class="card-title">
                                            <i class="fas fa-map-marker-alt mr-1"></i>
                                            Visitors
                                        </h3>
                                        <!-- card tools -->
                                        <div class="card-tools">
                                            <button type="button" class="btn btn-primary btn-sm daterange" title="Date range">
                                                <i class="far fa-calendar-alt"></i>
                                            </button>
                                            <button type="button" class="btn btn-primary btn-sm" data-card-widget="collapse" title="Collapse">
                                                <i class="fas fa-minus"></i>
                                            </button>
                                        </div>
                                        <!-- /.card-tools -->
                                    </div>
                                    <div class="card-body">
                                        <div id="world-map" style="height: 250px; width: 100%;"></div>
                                    </div>
                                    <!-- /.card-body-->
                                    <div class="card-footer bg-transparent">
                                        <div class="row">
                                            <div class="col-4 text-center">
                                                <div id="sparkline-1"></div>
                                                <div class="text-white">Visitors</div>
                                            </div>
                                            <!-- ./col -->
                                            <div class="col-4 text-center">
                                                <div id="sparkline-2"></div>
                                                <div class="text-white">Online</div>
                                            </div>
                                            <!-- ./col -->
                                            <div class="col-4 text-center">
                                                <div id="sparkline-3"></div>
                                                <div class="text-white">Sales</div>
                                            </div>
                                            <!-- ./col -->
                                        </div>
                                        <!-- /.row -->
                                    </div>
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