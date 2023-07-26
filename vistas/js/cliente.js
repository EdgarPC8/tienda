const btnModificar = document.querySelectorAll(".btn_modificar");

const modificar = async (target) => {
  const id = target.getAttribute("data-id-cliente");
  const data = {
    id,
    modificar: "modificar",
  };
  const request = await fetch("peticiones/cliente.php", {
    body: JSON.stringify(data),
    method: "POST",
  });
  const response = await request.json();
  console.log(response);
};




const clickHandler = async (event) => {
  const { target } = event;
  if (target.matches(".btn_modificar")) modificar(target);
};

document.addEventListener("click", clickHandler);
