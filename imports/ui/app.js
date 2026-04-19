import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { WeightLogs, ExerciseLogs, PantSizeLogs, CalorieLogs, Settings } from '/imports/api/collections';
import './app.css';

const fullDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });

function formatInputDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayDate() {
  return formatInputDate(new Date());
}

function parseDateInput(value) {
  return value ? new Date(`${value}T12:00:00`) : new Date();
}

function blankState() {
  return { id: '', date: todayDate(), a: '', b: '' };
}

function latest(coll) {
  return coll.findOne({}, { sort: { createdAt: -1 } });
}

function monthWeightCount(date, excludeId) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return WeightLogs.find({ createdAt: { $gte: start, $lt: end } }).fetch().filter((item) => item._id !== excludeId).length;
}

function groupByMonth(entries) {
  const groups = {};
  entries.forEach((entry) => {
    const d = entry.createdAt || new Date();
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!groups[key]) {
      groups[key] = {
        monthLabel: monthFormatter.format(d),
        sortDate: new Date(d.getFullYear(), d.getMonth(), 1),
        entries: [],
      };
    }
    groups[key].entries.push(entry);
  });
  return Object.values(groups)
    .sort((a, b) => b.sortDate - a.sortDate)
    .map((group) => {
      group.entries.sort((a, b) => b.createdAt - a.createdAt);
      return group;
    });
}

function drawChart() {
  const canvas = document.getElementById('weightChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const logs = WeightLogs.find({}, { sort: { createdAt: 1 } }).fetch();
  const width = 800;
  const height = 320;
  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff7fb';
  ctx.fillRect(0, 0, width, height);

  if (!logs.length) {
    ctx.fillStyle = '#8a6b79';
    ctx.font = '16px Arial';
    ctx.fillText('No weight data yet.', 20, 40);
    return;
  }

  const pad = { top: 20, right: 20, bottom: 50, left: 50 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const vals = logs.map((x) => Number(x.weight));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);

  ctx.strokeStyle = '#ead2de';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#d85f93';
  ctx.lineWidth = 3;
  ctx.beginPath();
  logs.forEach((log, i) => {
    const x = pad.left + (logs.length === 1 ? chartW / 2 : (chartW * i) / (logs.length - 1));
    const y = pad.top + ((max - Number(log.weight)) / span) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  logs.forEach((log, i) => {
    const x = pad.left + (logs.length === 1 ? chartW / 2 : (chartW * i) / (logs.length - 1));
    const y = pad.top + ((max - Number(log.weight)) / span) * chartH;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d85f93';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

Template.app.onCreated(function () {
  this.page = new ReactiveVar('home');
  this.weightState = new ReactiveVar(blankState());
  this.exerciseState = new ReactiveVar(blankState());
  this.pantState = new ReactiveVar(blankState());
  this.calorieState = new ReactiveVar(blankState());
  this.message = new ReactiveVar('');
  this.menuOpen = new ReactiveVar(false);
});

Template.app.onRendered(function () {
  this.autorun(() => {
    WeightLogs.find().fetch();
    Meteor.defer(drawChart);
  });
});

Template.app.helpers({
  isPage(page) {
    return Template.instance().page.get() === page;
  },
  activeClass(page) {
    return Template.instance().page.get() === page ? 'active' : '';
  },
  message() {
    return Template.instance().message.get();
  },
  menuOpen() {
    return Template.instance().menuOpen.get();
  },
  currentWeight() {
    const item = latest(WeightLogs);
    return item ? `${item.weight} lbs` : '—';
  },
  goalWeight() {
    const s = Settings.findOne();
    return s && s.goalWeight ? `${s.goalWeight} lbs` : '—';
  },
  deltaText() {
    const item = latest(WeightLogs);
    const s = Settings.findOne();
    if (!item || !s || !s.goalWeight) return 'Add a weigh-in and a goal weight to see your progress.';
    const diff = Number(item.weight) - Number(s.goalWeight);
    if (diff > 0) return `${Math.abs(diff).toFixed(1)} lbs above goal`;
    if (diff < 0) return `${Math.abs(diff).toFixed(1)} lbs below goal`;
    return 'You are at your goal.';
  },
  latestPant() {
    const item = latest(PantSizeLogs);
    return item ? item.size : '—';
  },
  latestCalories() {
    const item = latest(CalorieLogs);
    return item ? String(item.calories) : '—';
  },
  recentWeights() { return WeightLogs.find({}, { sort: { createdAt: -1 }, limit: 5 }).fetch(); },
  recentExercise() { return ExerciseLogs.find({}, { sort: { createdAt: -1 }, limit: 5 }).fetch(); },
  weightEntries() { return WeightLogs.find({}, { sort: { createdAt: -1 }, limit: 20 }).fetch(); },
  exerciseEntries() { return ExerciseLogs.find({}, { sort: { createdAt: -1 }, limit: 20 }).fetch(); },
  pantEntries() { return PantSizeLogs.find({}, { sort: { createdAt: -1 }, limit: 20 }).fetch(); },
  calorieEntries() { return CalorieLogs.find({}, { sort: { createdAt: -1 }, limit: 20 }).fetch(); },
  weightMonths() { return groupByMonth(WeightLogs.find({}, { sort: { createdAt: -1 } }).fetch()); },
  pantMonths() { return groupByMonth(PantSizeLogs.find({}, { sort: { createdAt: -1 } }).fetch()); },
  calorieMonths() { return groupByMonth(CalorieLogs.find({}, { sort: { createdAt: -1 } }).fetch()); },
  currentMonthCount() { return monthWeightCount(new Date(), null); },
  formatDate(date) { return date ? fullDateFormatter.format(date) : ''; },
  hasWeights() { return WeightLogs.find().count() > 0; },
  hasExercise() { return ExerciseLogs.find().count() > 0; },
  hasPantHistory() { return PantSizeLogs.find().count() > 0; },
  hasCalories() { return CalorieLogs.find().count() > 0; },
  weightState() { return Template.instance().weightState.get(); },
  exerciseState() { return Template.instance().exerciseState.get(); },
  pantState() { return Template.instance().pantState.get(); },
  calorieState() { return Template.instance().calorieState.get(); },
  goalWeightValue() {
    const s = Settings.findOne();
    return s && s.goalWeight ? s.goalWeight : '';
  },
  backfillDate() {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return formatInputDate(d);
  },
  hasWeightHistory() {
    return WeightLogs.find().count() > 0;
  },
});

Template.app.events({
  'click .menu-toggle'(event, instance) {
    event.preventDefault();
    instance.menuOpen.set(!instance.menuOpen.get());
  },

  'click .nav-btn'(event, instance) {
    instance.page.set(event.currentTarget.dataset.page);
    instance.menuOpen.set(false);
    Meteor.defer(drawChart);
  },

  'submit .js-weight-form'(event, instance) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.entryId.value;
    const date = parseDateInput(form.logDate.value);
    const weight = Number(form.weight.value);
    if (monthWeightCount(date, id || null) >= 3) {
      instance.message.set('That month already has 3 weigh-ins.');
      return;
    }
    if (id) WeightLogs.update(id, { $set: { createdAt: date, weight } });
    else WeightLogs.insert({ createdAt: date, insertedAt: new Date(), weight });
    instance.weightState.set(blankState());
    instance.message.set(id ? 'Weight entry updated.' : 'Weight entry saved.');
    Meteor.defer(drawChart);
  },
  'click .js-edit-weight'(event, instance) {
    const item = WeightLogs.findOne(event.currentTarget.dataset.id);
    if (!item) return;
    instance.weightState.set({ id: item._id, date: formatInputDate(item.createdAt), a: String(item.weight), b: '' });
    instance.message.set('Editing weight entry.');
  },
  'click .js-delete-weight'(event, instance) {
    WeightLogs.remove(event.currentTarget.dataset.id);
    instance.weightState.set(blankState());
    instance.message.set('Weight entry deleted.');
    Meteor.defer(drawChart);
  },
  'click .js-cancel-weight'(event, instance) {
    event.preventDefault();
    instance.weightState.set(blankState());
    instance.message.set('Weight edit canceled.');
  },

  'submit .js-exercise-form'(event, instance) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.entryId.value;
    const payload = { createdAt: parseDateInput(form.logDate.value), minutes: Number(form.minutes.value), notes: form.notes.value.trim() };
    if (id) ExerciseLogs.update(id, { $set: payload });
    else ExerciseLogs.insert({ ...payload, insertedAt: new Date() });
    instance.exerciseState.set(blankState());
    instance.message.set(id ? 'Exercise entry updated.' : 'Exercise entry saved.');
  },
  'click .js-edit-exercise'(event, instance) {
    const item = ExerciseLogs.findOne(event.currentTarget.dataset.id);
    if (!item) return;
    instance.exerciseState.set({ id: item._id, date: formatInputDate(item.createdAt), a: String(item.minutes), b: item.notes || '' });
    instance.message.set('Editing exercise entry.');
  },
  'click .js-delete-exercise'(event, instance) {
    ExerciseLogs.remove(event.currentTarget.dataset.id);
    instance.exerciseState.set(blankState());
    instance.message.set('Exercise entry deleted.');
  },
  'click .js-cancel-exercise'(event, instance) {
    event.preventDefault();
    instance.exerciseState.set(blankState());
    instance.message.set('Exercise edit canceled.');
  },

  'submit .js-pant-form'(event, instance) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.entryId.value;
    const payload = { createdAt: parseDateInput(form.logDate.value), size: form.size.value.trim() };
    if (id) PantSizeLogs.update(id, { $set: payload });
    else PantSizeLogs.insert({ ...payload, insertedAt: new Date() });
    instance.pantState.set(blankState());
    instance.message.set(id ? 'Pant size entry updated.' : 'Pant size entry saved.');
  },
  'click .js-edit-pant'(event, instance) {
    const item = PantSizeLogs.findOne(event.currentTarget.dataset.id);
    if (!item) return;
    instance.pantState.set({ id: item._id, date: formatInputDate(item.createdAt), a: item.size || '', b: '' });
    instance.message.set('Editing pant size entry.');
  },
  'click .js-delete-pant'(event, instance) {
    PantSizeLogs.remove(event.currentTarget.dataset.id);
    instance.pantState.set(blankState());
    instance.message.set('Pant size entry deleted.');
  },
  'click .js-cancel-pant'(event, instance) {
    event.preventDefault();
    instance.pantState.set(blankState());
    instance.message.set('Pant size edit canceled.');
  },

  'submit .js-calorie-form'(event, instance) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.entryId.value;
    const payload = { createdAt: parseDateInput(form.logDate.value), calories: Number(form.calories.value) };
    if (id) CalorieLogs.update(id, { $set: payload });
    else CalorieLogs.insert({ ...payload, insertedAt: new Date() });
    instance.calorieState.set(blankState());
    instance.message.set(id ? 'Calorie entry updated.' : 'Calorie entry saved.');
  },
  'click .js-edit-calorie'(event, instance) {
    const item = CalorieLogs.findOne(event.currentTarget.dataset.id);
    if (!item) return;
    instance.calorieState.set({ id: item._id, date: formatInputDate(item.createdAt), a: String(item.calories), b: '' });
    instance.message.set('Editing calorie entry.');
  },
  'click .js-delete-calorie'(event, instance) {
    CalorieLogs.remove(event.currentTarget.dataset.id);
    instance.calorieState.set(blankState());
    instance.message.set('Calorie entry deleted.');
  },
  'click .js-cancel-calorie'(event, instance) {
    event.preventDefault();
    instance.calorieState.set(blankState());
    instance.message.set('Calorie edit canceled.');
  },

  'submit .js-settings-form'(event, instance) {
    event.preventDefault();
    const goalWeight = event.currentTarget.goalWeight.value;
    const existing = Settings.findOne();
    if (existing) Settings.update(existing._id, { $set: { goalWeight } });
    else Settings.insert({ goalWeight, createdAt: new Date() });
    instance.message.set('Settings saved.');
  },
});
