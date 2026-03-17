const { Router } = require('express');
const subscriptionRoutes = require('./subscription');

const router = Router();

router.use('/subscription', subscriptionRoutes);

router.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'subscription-service' });
});

module.exports = router;
