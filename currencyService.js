// currencyService.js
const axios = require('axios');
const { sql, poolPromise } = require('./db');

async function getExchangeRate(from, to) {
  const baseCurrency = from.toUpperCase();
  const targetCurrency = to.toUpperCase();

  if (baseCurrency === targetCurrency) {
    return 1.0;
  }

  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  const pool = await poolPromise;

  // 1. Önce Veri Tabanındaki Cache (ExchangeRateLogs) Kontrol Edilir
  const cacheResult = await pool.request()
    .input('baseCurrency', sql.NVarChar(3), baseCurrency)
    .input('targetCurrency', sql.NVarChar(3), targetCurrency)
    .input('rateDate', sql.Date, today)
    .query(`
      SELECT Rate FROM ExchangeRateLogs 
      WHERE BaseCurrency = @baseCurrency AND TargetCurrency = @targetCurrency AND RateDate = @rateDate
    `);

  if (cacheResult.recordset.length > 0) {
    return cacheResult.recordset[0].Rate;
  }

  // 2. Cache'te Yoksa Dış API'ye İstek Atılır
  try {
    const response = await axios.get(`https://open.er-api.com/v6/latest/${baseCurrency}`);
    const rate = response.data.rates[targetCurrency];

    if (!rate) {
      throw new Error(`Geçersiz para birimi çifti: ${baseCurrency} -> ${targetCurrency}`);
    }

    // 3. API'den Gelen Yeni Kur Veri Tabanına Cache Olarak Kaydedilir
    await pool.request()
      .input('baseCurrency', sql.NVarChar(3), baseCurrency)
      .input('targetCurrency', sql.NVarChar(3), targetCurrency)
      .input('rate', sql.Decimal(18, 4), rate)
      .input('rateDate', sql.Date, today)
      .query(`
        INSERT INTO ExchangeRateLogs (BaseCurrency, TargetCurrency, Rate, RateDate)
        VALUES (@baseCurrency, @targetCurrency, @rate, @rateDate)
      `);

    return rate;
  } catch (error) {
    console.error('Döviz kuru çekme hatası:', error.message);
    throw new Error('Döviz kuru servisine ulaşılamadı.');
  }
}

module.exports = {
  getExchangeRate
};