const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const connectToDatabase = require('../conexao'); // Importa a função de conexão
const app = express();

// Configurar o Cloudinary
cloudinary.config({
  cloud_name: 'dg2q8pzn8',
  api_key: '914126642355694',
  api_secret: 'yqOi9rEw5yUHqePZqxL-KPXkCQk'
});

// Configuração do CloudinaryStorage para o multer
const cloudinaryStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'products',
    format: async (req, file) => 'png', // ou 'jpeg'
    public_id: (req, file) => `${file.originalname}_${Date.now()}`,
    transformation: [
      {
        width: 500,
        height: 500,
        crop: 'limit',
        fetch_format: 'auto',
        quality: 'auto',
      },
    ],
  },
});

// Configurar o multer com o storage do Cloudinary
const upload = multer({
  storage: cloudinaryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Formato de arquivo não suportado!'), false);
    }
    cb(null, true);
  }
});

// Habilita CORS para todas as rotas
app.use(cors());
app.use(express.json());

// Rota para adicionar um produto
app.post('/api/products', upload.array('photos'), async (req, res) => {
  const { name, category, description, specs, companies_prices } = req.body;

  let connection;
  try {
    const parsedDescription = JSON.parse(description);
    const parsedSpecs = JSON.parse(specs);
    const parsedCompaniesPrices = JSON.parse(companies_prices);

    // Conectar ao banco de dados
    connection = await connectToDatabase();
    await connection.beginTransaction();

    try {
      // Inserir o produto na tabela produtos_api
      const [result] = await connection.query(
        'INSERT INTO produtos_api (nome, categoria, descricao, especificacoes) VALUES (?, ?, ?, ?)', 
        [name, category, JSON.stringify(parsedDescription), JSON.stringify(parsedSpecs)]
      );
      const produtoId = result.insertId;

      // Inserir as fotos na tabela fotos_api
      const photoPromises = req.files.map(file => {
        return connection.query(
          'INSERT INTO fotos_api (produto_id, link_foto) VALUES (?, ?)', 
          [produtoId, file.path]
        );
      });

      // Inserir os preços e empresas nas tabelas precos_api e empresas_api
      const pricePromises = parsedCompaniesPrices.map(async (companyPrice) => {
        let empresaId;

        // Verificar se a empresa já existe
        const [rows] = await connection.query('SELECT id FROM empresas_api WHERE nome_empresa = ?', [companyPrice.empresa]);

        if (rows.length > 0) {
          empresaId = rows[0].id;
        } else {
          // Inserir nova empresa
          const [empresaResult] = await connection.query(
            'INSERT INTO empresas_api (nome_empresa, link_empresa) VALUES (?, ?)', 
            [companyPrice.empresa, companyPrice.link]
          );
          empresaId = empresaResult.insertId;
        }

        // Inserir os preços e datas na tabela precos_api
        const priceInsertPromises = companyPrice.precosDatas.map(precoData => {
          return connection.query(
            'INSERT INTO precos_api (produto_id, empresa_id, valor, data) VALUES (?, ?, ?, ?)', 
            [produtoId, empresaId, precoData.preco, precoData.data]
          );
        });

        return Promise.all(priceInsertPromises);
      });

      // Esperar até que todas as promessas sejam resolvidas
      await Promise.all([...photoPromises, ...pricePromises]);

      // Confirmar a transação
      await connection.commit();
      res.json({ message: 'Produto adicionado com sucesso', productId: produtoId });
    } catch (err) {
      // Reverter a transação em caso de erro
      await connection.rollback();
      res.status(500).json({ message: 'Erro ao adicionar produto', error: err });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erro interno do servidor', error: error.message });
  } finally {
    if (connection) {
      connection.end(); // Fecha a conexão
    }
  }
});

// Rota para buscar produtos
app.get('/api/products', async (req, res) => {
  let connection;
  try {
    connection = await connectToDatabase(); // Conecta ao banco de dados
    const [produtos] = await connection.query('SELECT * FROM produtos_api');
    
    // Para cada produto, busca as fotos e os preços relacionados
    const produtosCompletos = await Promise.all(produtos.map(async (produto) => {
      const [fotos] = await connection.query('SELECT link_foto FROM fotos_api WHERE produto_id = ?', [produto.id]);
      const [precos] = await connection.query(
        'SELECT precos_api.valor, precos_api.data, empresas_api.nome_empresa, empresas_api.link_empresa FROM precos_api INNER JOIN empresas_api ON precos_api.empresa_id = empresas_api.id WHERE precos_api.produto_id = ?', 
        [produto.id]
      );

      return {
        ...produto,
        fotos: fotos ? fotos.map(foto => foto.link_foto) : [],
        precos: precos ? precos.map(preco => ({
          empresa: preco.nome_empresa,
          link: preco.link_empresa,
          valor: preco.valor,
          data: preco.data
        })) : []
      };
    }));

    res.json(produtosCompletos);
  } catch (error) {
    // Adiciona o log do erro no console
    console.error('Erro ao buscar produtos:', error);

    // Resposta mais detalhada sobre o erro
    res.status(500).json({
      message: 'Erro ao buscar produtos',
      error: error.message,
      stack: error.stack,
      queryDetails: {
        query: 'SELECT * FROM produtos_api',
        produtoQuery: 'SELECT link_foto FROM fotos_api WHERE produto_id = ?',
        precoQuery: 'SELECT precos_api.valor, precos_api.data, empresas_api.nome_empresa, empresas_api.link_empresa FROM precos_api INNER JOIN empresas_api ON precos_api.empresa_id = empresas_api.id WHERE precos_api.produto_id = ?'
      }
    });
  } finally {
    if (connection) {
      connection.end(); // Fecha a conexão
    }
  }
});

// Rota para excluir um produto
app.delete('/api/products/:id', async (req, res) => {
  const productId = parseInt(req.params.id);

  let connection;
  try {
    connection = await connectToDatabase(); // Conecta ao banco de dados
    // Excluir todas as fotos, preços e o produto
    await connection.query('DELETE FROM fotos_api WHERE produto_id = ?', [productId]);
    await connection.query('DELETE FROM precos_api WHERE produto_id = ?', [productId]);
    await connection.query('DELETE FROM produtos_api WHERE id = ?', [productId]);

    res.json({ message: 'Produto excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ message: 'Erro ao excluir produto', error });
  } finally {
    if (connection) {
      connection.end(); // Fecha a conexão
    }
  }
});

module.exports = app;
