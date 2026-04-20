import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { WeightLogs, ExerciseLogs, PantSizeLogs, CalorieLogs, Settings } from '/imports/api/collections';
import './app.css';

const fullDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });

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

function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function roundUp(value) {
  if (value <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}


function dateKey(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function dayDiff(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const aDay = new Date(a);
  const bDay = new Date(b);
  aDay.setHours(12, 0, 0, 0);
  bDay.setHours(12, 0, 0, 0);
  return Math.round((aDay - bDay) / msPerDay);
}

function streakSummary() {
  const allEntries = [
    ...WeightLogs.find({}, { fields: { createdAt: 1 } }).fetch(),
    ...ExerciseLogs.find({}, { fields: { createdAt: 1 } }).fetch(),
    ...PantSizeLogs.find({}, { fields: { createdAt: 1 } }).fetch(),
    ...CalorieLogs.find({}, { fields: { createdAt: 1 } }).fetch(),
  ];

  const uniqueDays = [...new Set(allEntries.map((item) => item.createdAt).filter(Boolean).map(dateKey))]
    .sort()
    .map((value) => new Date(`${value}T12:00:00`));

  if (!uniqueDays.length) {
    return {
      days: 0,
      label: 'No streak yet',
      detail: 'Log weight, calories, exercise, or pant size to start your streak.',
      status: 'Start today',
      lastActive: '',
      isHot: false,
    };
  }

  let days = 1;
  for (let i = uniqueDays.length - 1; i > 0; i -= 1) {
    if (dayDiff(uniqueDays[i], uniqueDays[i - 1]) === 1) days += 1;
    else break;
  }

  const lastActive = uniqueDays[uniqueDays.length - 1];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const sinceLast = dayDiff(today, lastActive);

  let status = 'Logged today';
  if (sinceLast === 1) status = 'Last active yesterday';
  else if (sinceLast > 1) status = `Last active ${shortDateFormatter.format(lastActive)}`;

  return {
    days,
    label: days === 1 ? '1 day streak' : `${days} day streak`,
    detail: `Consecutive days with at least one health log entry.`,
    status,
    lastActive: `${weekdayFormatter.format(lastActive)}, ${shortDateFormatter.format(lastActive)}`,
    isHot: sinceLast <= 1,
  };
}

function weeklySeries() {
  const weightLogs = WeightLogs.find({}, { sort: { createdAt: 1 } }).fetch();
  const calorieLogs = CalorieLogs.find({}, { sort: { createdAt: 1 } }).fetch();
  const exerciseLogs = ExerciseLogs.find({}, { sort: { createdAt: 1 } }).fetch();

  const allDates = [...weightLogs, ...calorieLogs, ...exerciseLogs]
    .map((item) => item.createdAt)
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (!allDates.length) return [];

  const firstWeek = startOfWeek(allDates[0]);
  const lastWeek = startOfWeek(allDates[allDates.length - 1]);
  const buckets = {};

  for (let cursor = new Date(firstWeek); cursor <= lastWeek; cursor.setDate(cursor.getDate() + 7)) {
    const key = cursor.toISOString().slice(0, 10);
    buckets[key] = {
      weekStart: new Date(cursor),
      weights: [],
      calories: 0,
      exercise: 0,
    };
  }

  weightLogs.forEach((item) => {
    const key = startOfWeek(item.createdAt).toISOString().slice(0, 10);
    if (buckets[key]) buckets[key].weights.push(Number(item.weight));
  });
  calorieLogs.forEach((item) => {
    const key = startOfWeek(item.createdAt).toISOString().slice(0, 10);
    if (buckets[key]) buckets[key].calories += Number(item.calories) || 0;
  });
  exerciseLogs.forEach((item) => {
    const key = startOfWeek(item.createdAt).toISOString().slice(0, 10);
    if (buckets[key]) buckets[key].exercise += Number(item.minutes) || 0;
  });

  return Object.values(buckets).map((bucket) => ({
    weekStart: bucket.weekStart,
    label: shortDateFormatter.format(bucket.weekStart),
    weight: bucket.weights.length ? bucket.weights.reduce((sum, value) => sum + value, 0) / bucket.weights.length : null,
    calories: bucket.calories,
    exercise: bucket.exercise,
  }));
}

function drawLine(ctx, points, color, width, dash = []) {
  const usable = points.filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!usable.length) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  usable.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();
  ctx.restore();
}

function drawPoints(ctx, points, color, radius) {
  points.filter(Boolean).forEach((point) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawChart() {
  const canvas = document.getElementById('weightChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const series = weeklySeries();
  const container = canvas.parentElement;
  const containerWidth = Math.max(300, Math.floor((container && container.clientWidth) || canvas.clientWidth || 900));
  const isMobile = window.innerWidth <= 720;
  const width = Math.min(960, Math.max(320, containerWidth - (isMobile ? 6 : 0)));
  const height = isMobile ? 300 : 420;
  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff7fb';
  ctx.fillRect(0, 0, width, height);

  if (!series.length || !series.some((week) => week.weight !== null)) {
    ctx.fillStyle = '#8a6b79';
    ctx.font = `${isMobile ? 14 : 16}px Arial`;
    ctx.fillText('No weight data yet.', 20, 40);
    return;
  }

  const pad = isMobile
    ? { top: 20, right: 48, bottom: 56, left: 42 }
    : { top: 28, right: 112, bottom: 72, left: 64 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const weightValues = series.map((item) => item.weight).filter((value) => value !== null);
  const weightMin = Math.min(...weightValues);
  const weightMax = Math.max(...weightValues);
  const weightPadding = Math.max(2, (weightMax - weightMin) * 0.2 || 2);
  const weightAxisMin = Math.max(0, Math.floor(weightMin - weightPadding));
  const weightAxisMax = Math.ceil(weightMax + weightPadding);
  const weightSpan = Math.max(1, weightAxisMax - weightAxisMin);

  const calorieMax = roundUp(Math.max(...series.map((item) => item.calories), 0));
  const exerciseMax = roundUp(Math.max(...series.map((item) => item.exercise), 0));

  const xForIndex = (index) => pad.left + (series.length === 1 ? chartW / 2 : (chartW * index) / (series.length - 1));
  const yForWeight = (value) => pad.top + ((weightAxisMax - value) / weightSpan) * chartH;
  const yForCalories = (value) => pad.top + chartH - ((value || 0) / Math.max(calorieMax, 1)) * chartH;
  const yForExercise = (value) => pad.top + chartH - ((value || 0) / Math.max(exerciseMax, 1)) * chartH;

  ctx.strokeStyle = '#ead2de';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();

    const labelValue = Math.round(weightAxisMax - (weightSpan / 4) * i);
    ctx.fillStyle = '#8a6b79';
    ctx.font = `${isMobile ? 10 : 12}px Arial`;
    ctx.textAlign = 'right';
    ctx.fillText(String(labelValue), pad.left - 6, y + 3);
  }

  ctx.fillStyle = '#8a6b79';
  ctx.font = `${isMobile ? 10 : 12}px Arial`;
  ctx.textAlign = 'center';
  const approxLabelSlots = Math.max(2, Math.floor(chartW / (isMobile ? 56 : 72)));
  const labelStep = Math.max(1, Math.ceil(series.length / approxLabelSlots));
  series.forEach((item, index) => {
    const x = xForIndex(index);
    if (index % labelStep === 0 || index === series.length - 1) {
      const label = isMobile
        ? `${item.weekStart.getMonth() + 1}/${item.weekStart.getDate()}`
        : item.label;
      ctx.fillText(label, x, height - 18);
    }
  });

  if (!isMobile) {
    ctx.save();
    ctx.translate(18, pad.top + chartH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#d85f93';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Avg Weight (lbs)', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(width - 20, pad.top + chartH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#f29f3d';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Weekly Calories', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(width - 54, pad.top + chartH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#2f7a5d';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Exercise Minutes', 0, 0);
    ctx.restore();
  }

  ctx.fillStyle = '#f29f3d';
  ctx.textAlign = 'left';
  ctx.font = `${isMobile ? 10 : 12}px Arial`;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (chartH / 4) * i;
    const value = Math.round((calorieMax / 4) * (4 - i));
    ctx.fillText(String(value), pad.left + chartW + (isMobile ? 6 : 12), y + 3);
  }

  if (!isMobile) {
    ctx.fillStyle = '#2f7a5d';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + (chartH / 4) * i;
      const value = Math.round((exerciseMax / 4) * (4 - i));
      ctx.fillText(String(value), pad.left + chartW + 62, y + 4);
    }
  }

  const weightPoints = series.map((item, index) => item.weight === null ? null : ({ x: xForIndex(index), y: yForWeight(item.weight) }));
  const caloriePoints = series.map((item, index) => ({ x: xForIndex(index), y: yForCalories(item.calories) }));
  const exercisePoints = series.map((item, index) => ({ x: xForIndex(index), y: yForExercise(item.exercise) }));

  drawLine(ctx, caloriePoints, '#f29f3d', isMobile ? 2 : 2.5, [8, 5]);
  drawLine(ctx, exercisePoints, '#2f7a5d', isMobile ? 2 : 2.5, [2, 6]);
  drawLine(ctx, weightPoints, '#d85f93', isMobile ? 2.5 : 3);

  drawPoints(ctx, weightPoints, '#d85f93', isMobile ? 3 : 4);
  drawPoints(ctx, caloriePoints, '#f29f3d', isMobile ? 2.5 : 3);
  drawPoints(ctx, exercisePoints, '#2f7a5d', isMobile ? 2.5 : 3);
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
  this.handleResize = () => Meteor.defer(drawChart);
  window.addEventListener('resize', this.handleResize);

  this.autorun(() => {
    WeightLogs.find().fetch();
    CalorieLogs.find().fetch();
    ExerciseLogs.find().fetch();
    Meteor.defer(drawChart);
  });
});

Template.app.onDestroyed(function () {
  if (this.handleResize) {
    window.removeEventListener('resize', this.handleResize);
  }
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
  streakDays() { return streakSummary().days; },
  streakLabel() { return streakSummary().label; },
  streakDetail() { return streakSummary().detail; },
  streakStatus() { return streakSummary().status; },
  streakLastActive() { return streakSummary().lastActive; },
  streakHotClass() { return streakSummary().isHot ? 'is-hot' : ''; },
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
    Meteor.defer(drawChart);
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
    Meteor.defer(drawChart);
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
    Meteor.defer(drawChart);
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
    Meteor.defer(drawChart);
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
