// src/backend/models/User.js
import { DataTypes } from 'sequelize';
import { sequelize } from '../database/connection.js';

export const License = sequelize.define('licenses', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true, // Define 'id' como clave primaria
    autoIncrement: true, // Habilita la auto-incrementación
  },
  name: {
    type: DataTypes.TEXT,
  },
  token: {
    type: DataTypes.TEXT,
  },
  time: {
    type: DataTypes.TEXT,
  },
  valide: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  dateCreation: {
    type: DataTypes.DATE,
    defaultValue: () => new Date().toISOString(),

  },
  dateUse: {
    type: DataTypes.DATE,
  },
  dateExpiration: {
    type: DataTypes.DATE,
  },
},
{
  timestamps: false,
}
);
