const { Pool } = require('pg');

let cfg = require('./config.json')

let express = require('express');
let cors = require('cors')

let pool= new Pool({
	host: cfg.database.host,
	user: cfg.database.user,
	password: cfg.database.password,
	database: cfg.database.db
	});

	exports.loadProducts = function () {
		return new Promise((resolve, reject) => {
			pool.query(`select i.itemid, i.title, i.description, i.price, i.likes, i.dislikes, i.status, array_to_string(array_agg(h.allergen), ', ') as allergen 
			from items i, item_hasallergens h  where i.itemid = h.itemid group by i.itemid order by i.itemid  `, (err, res) => {
				if(err) {
					reject(err);
				} else {
					resolve(res);
				}
			});
		});
	}

