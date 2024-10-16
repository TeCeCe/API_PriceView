const mysql = require('mysql2/promise');

// Crie a conexão com o banco de dados utilizando 'mysql2/promise' para facilitar o uso de async/await
async function connectToDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: 'srv1595.hstgr.io', // Substitua pelo host correto da Hostinger
      user: 'u947683216_tcc',      // Seu usuário do banco de dados
      password: '@A06E13T16H17P30tcc', // Sua senha
      database: 'u947683216_tccbanco', // Seu banco de dados
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log('Conectado ao banco de dados MySQL.');
    
    return connection; // Retorna a conexão para que você possa reutilizá-la nas queries
  } catch (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
    throw err; // Lança o erro caso ocorra, para que ele possa ser tratado em outros lugares
  }
}

// Exporta a função para que outros arquivos possam usá-la
module.exports = connectToDatabase;
