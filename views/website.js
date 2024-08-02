const mongoose = require('mongoose');

const SectionSchema = new mongoose.Schema({
  template_name: String,
  data: {
    Text: String,
    Subtext: String
  }
});

const WebsiteSchema = new mongoose.Schema({
  Name: String,
  Address: String,
  Url: String,
  Theme: {
    primary_color: String,
    secondary_color: String
  },
  sections: [SectionSchema]
});

module.exports = mongoose.model('Website', WebsiteSchema);
