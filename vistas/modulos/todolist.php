<div class="content-wrapper">
    <!-- Content Header (Page header) -->
    <section class="content-header">
        <div class="container-fluid">
            <div class="row mb-2">
                <div class="col-sm-6">
                    <h1>Todo List</h1>
                </div>
                <div class="col-sm-6">
                    <ol class="breadcrumb float-sm-right">
                        <li class="breadcrumb-item"><a href="inicio">Home</a></li>
                        <li class="breadcrumb-item active">Todo List</li>
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
                   Todo List 
                </button>


            </div>
            <div class="card-body">
                <div id="myModal" class="modal fade" role="dialog">
                    <div class="modal-dialog">

                        <!-- Modal content-->
                        <div class="modal-content">
                            <div class="modal-header">
                                <h4 class="modal-title">Todo List</h4>
                                <button type="button" class="close" data-dismiss="modal">&times;</button>

                            </div>
                            <div class="modal-body">



                                <div class="card">
                                    <div class="card-header">
                                        <h3 class="card-title">
                                            <i class="ion ion-clipboard mr-1"></i>
                                            To Do List
                                        </h3>

                                        <div class="card-tools">
                                            <ul class="pagination pagination-sm">
                                                <li class="page-item"><a href="#" class="page-link">&laquo;</a></li>
                                                <li class="page-item"><a href="#" class="page-link">1</a></li>
                                                <li class="page-item"><a href="#" class="page-link">2</a></li>
                                                <li class="page-item"><a href="#" class="page-link">3</a></li>
                                                <li class="page-item"><a href="#" class="page-link">&raquo;</a></li>
                                            </ul>
                                        </div>
                                    </div>
                                    <!-- /.card-header -->
                                    <div class="card-body">
                                        <ul class="todo-list" data-widget="todo-list">
                                            <li>
                                                <!-- drag handle -->
                                                <span class="handle">
                                                    <i class="fas fa-ellipsis-v"></i>
                                                    <i class="fas fa-ellipsis-v"></i>
                                                </span>
                                                <!-- checkbox -->
                                                <div class="icheck-primary d-inline ml-2">
                                                    <input type="checkbox" value="" name="todo1" id="todoCheck1">
                                                    <label for="todoCheck1"></label>
                                                </div>
                                                <!-- todo text -->
                                                <span class="text">Design a nice theme</span>
                                                <!-- Emphasis label -->
                                                <small class="badge badge-danger"><i class="far fa-clock"></i> 2 mins</small>
                                                <!-- General tools such as edit or delete-->
                                                <div class="tools">
                                                    <i class="fas fa-edit"></i>
                                                    <i class="fas fa-trash-o"></i>
                                                </div>
                                            </li>
                                            <li>
                                                <span class="handle">
                                                    <i class="fas fa-ellipsis-v"></i>
                                                    <i class="fas fa-ellipsis-v"></i>
                                                </span>
                                                <div class="icheck-primary d-inline ml-2">
                                                    <input type="checkbox" value="" name="todo2" id="todoCheck2" checked>
                                                    <label for="todoCheck2"></label>
                                                </div>
                                                <span class="text">Make the theme responsive</span>
                                                <small class="badge badge-info"><i class="far fa-clock"></i> 4 hours</small>
                                                <div class="tools">
                                                    <i class="fas fa-edit"></i>
                                                    <i class="fas fa-trash-o"></i>
                                                </div>
                                            </li>
                                            <li>
                                                <span class="handle">
                                                    <i class="fas fa-ellipsis-v"></i>
                                                    <i class="fas fa-ellipsis-v"></i>
                                                </span>
                                                <div class="icheck-primary d-inline ml-2">
                                                    <input type="checkbox" value="" name="todo3" id="todoCheck3">
                                                    <label for="todoCheck3"></label>
                                                </div>
                                                <span class="text">Let theme shine like a star</span>
                                                <small class="badge badge-warning"><i class="far fa-clock"></i> 1 day</small>
                                                <div class="tools">
                                                    <i class="fas fa-edit"></i>
                                                    <i class="fas fa-trash-o"></i>
                                                </div>
                                            </li>
                                            <li>
                                                <span class="handle">
                                                    <i class="fas fa-ellipsis-v"></i>
                                                    <i class="fas fa-ellipsis-v"></i>
                                                </span>
                                                <div class="icheck-primary d-inline ml-2">
                                                    <input type="checkbox" value="" name="todo4" id="todoCheck4">
                                                    <label for="todoCheck4"></label>
                                                </div>
                                                <span class="text">Let theme shine like a star</span>
                                                <small class="badge badge-success"><i class="far fa-clock"></i> 3 days</small>
                                                <div class="tools">
                                                    <i class="fas fa-edit"></i>
                                                    <i class="fas fa-trash-o"></i>
                                                </div>
                                            </li>
                                            <li>
                                                <span class="handle">
                                                    <i class="fas fa-ellipsis-v"></i>
                                                    <i class="fas fa-ellipsis-v"></i>
                                                </span>
                                                <div class="icheck-primary d-inline ml-2">
                                                    <input type="checkbox" value="" name="todo5" id="todoCheck5">
                                                    <label for="todoCheck5"></label>
                                                </div>
                                                <span class="text">Check your messages and notifications</span>
                                                <small class="badge badge-primary"><i class="far fa-clock"></i> 1 week</small>
                                                <div class="tools">
                                                    <i class="fas fa-edit"></i>
                                                    <i class="fas fa-trash-o"></i>
                                                </div>
                                            </li>
                                            <li>
                                                <span class="handle">
                                                    <i class="fas fa-ellipsis-v"></i>
                                                    <i class="fas fa-ellipsis-v"></i>
                                                </span>
                                                <div class="icheck-primary d-inline ml-2">
                                                    <input type="checkbox" value="" name="todo6" id="todoCheck6">
                                                    <label for="todoCheck6"></label>
                                                </div>
                                                <span class="text">Let theme shine like a star</span>
                                                <small class="badge badge-secondary"><i class="far fa-clock"></i> 1 month</small>
                                                <div class="tools">
                                                    <i class="fas fa-edit"></i>
                                                    <i class="fas fa-trash-o"></i>
                                                </div>
                                            </li>
                                        </ul>
                                    </div>
                                    <!-- /.card-body -->
                                    <div class="card-footer clearfix">
                                        <button type="button" class="btn btn-primary float-right"><i class="fas fa-plus"></i> Add item</button>
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