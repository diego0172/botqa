// config/asesores.js
module.exports = {
  asesores: [
   
     { id: '50239959782@c.us', nombre: 'Diego' },
  ],
  comandos: {
    tomar: ['#tomar', '/tomar'],       // Reclamará una conversación:  #tomar 50212345678
    liberar: ['#liberar', '/liberar'], // Liberará una conversación:   #liberar 50212345678  (o sin número si ya está tomada)
    ver: ['#ver', '/ver'],             // Muestra resumen de la sesión: #ver 50212345678
  }
};
