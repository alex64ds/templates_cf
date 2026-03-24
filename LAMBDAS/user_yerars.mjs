export const handler = async (event) => {
    const body = JSON.parse(event.body);
    const nombre = body.nombre;
    const edad = body.edad;
  
    const mayorDeEdad = edad >= 18;
  
    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        body: JSON.stringify({
            saludo: `¡Hola ${nombre}!`,
            mayorDeEdad: mayorDeEdad
        }),
        isBase64Encoded: false
    };
  };