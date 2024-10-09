const mysql = require('mysql2');

// Crie a conexão com o banco de dados
const connection = mysql.createConnection({
  host: 'localhost', // host
  user: 'u947683216_tcc', // user
  password: '@A06E13T16H17P30tcc', // senha
  database: 'u947683216_tccbanco' // ex: 'mydatabase'
});

// Conecte-se ao banco de dados
connection.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
    return;
  }
  console.log('Conectado ao banco de dados MySQL.');
});

module.exports = connection;