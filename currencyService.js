// currencyService.js
const axios = require('axios');

/**
 * Belirtilen kaynak ve hedef para birimi arasındaki anlık kuru getirir.
 * @param {string} from - Kaynak Para Birimi (Örn: 'USD')
 * @param {string} to - Hedef Para Birimi (Örn: 'TRY')
 * @returns {Promise<number>} - Döviz Kuru
 */
async function getExchangeRate(from, to) {
  const baseCurrency = from.toUpperCase();
  const targetCurrency = to.toUpperCase();

  if (baseCurrency === targetCurrency) {
    return 1.0;
  }

  try {
    const response = await axios.get(`https://open.er-api.com/v6/latest/${baseCurrency}`);
    const rate = response.data.rates[targetCurrency];

    if (!rate) {
      throw new Error(`Geçersiz para birimi çifti: ${baseCurrency} -> ${targetCurrency}`);
    }

    return rate;
  } catch (error) {
    console.error('Döviz kuru çekme hatası:', error.message);
    throw new Error('Döviz kuru servisine ulaşılamadı.');
  }
}

module.exports = {
  getExchangeRate
};