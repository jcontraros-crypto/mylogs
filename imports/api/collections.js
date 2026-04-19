import { Mongo } from 'meteor/mongo';

export const WeightLogs = new Mongo.Collection('weightLogs');
export const ExerciseLogs = new Mongo.Collection('exerciseLogs');
export const PantSizeLogs = new Mongo.Collection('pantSizeLogs');
export const CalorieLogs = new Mongo.Collection('calorieLogs');
export const Settings = new Mongo.Collection('settings');
