import { Meteor } from 'meteor/meteor';
import { Settings } from '/imports/api/collections';

Meteor.startup(async () => {
  const existing = await Settings.findOneAsync({});

  if (!existing) {
    await Settings.insertAsync({
      goalWeight: '',
      createdAt: new Date(),
    });
  }
});
