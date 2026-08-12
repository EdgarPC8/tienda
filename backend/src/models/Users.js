// src/backend/models/User.js
import { DataTypes } from 'sequelize';
import { sequelize } from '../database/connection.js';

export const Users = sequelize.define('users', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true, // Define 'id' como clave primaria
    autoIncrement: true, // Habilita la auto-incrementación
  },
  ci: {
    type: DataTypes.STRING,
    unique: true,
  },
  documentType: {
    type: DataTypes.STRING,
  },
  firstName: {
    type: DataTypes.STRING,
  },
  secondName: {
    type: DataTypes.STRING,
  },
  firstLastName: {
    type: DataTypes.STRING,
  },
  secondLastName: {
    type: DataTypes.STRING,
  },
  birthday: {
    type: DataTypes.DATEONLY,
  },
  gender: {
    type: DataTypes.STRING,
  },
  photo: {
    type: DataTypes.TEXT,
  },
},
{
  timestamps: false,
}
);
