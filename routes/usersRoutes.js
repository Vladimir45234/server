const express = require('express');
const router = express.Router();
const { searchUsers, getUserById, blockUser, unblockUser } = require('../controllers/usersController');

router.get('/all', searchUsers);
router.get('/:id', getUserById);
router.post('/block', blockUser);
router.post('/unblock', unblockUser)

module.exports = router;
