// db.js
const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER || '.\\MSSQLSERVER',
  database: process.env.DB_NAME,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  connectionTimeout: 15000,
  requestTimeout: 30000
};

const poolPromise = new sql.ConnectionPool(dbConfig)
  .connect()
  .then(pool => {
    console.log('MS SQL Server bağlantısı başarıyla kuruldu.');
    return pool;
  })
  .catch(err => {
    console.error('Veri tabanı bağlantı hatası:', err);
    process.exit(1);
  });

module.exports = {
  sql,
  poolPromise
};