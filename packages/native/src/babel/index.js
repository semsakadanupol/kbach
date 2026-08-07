'use strict';

// @kbach/native is deprecated — the real Babel preset implementation moved to
// @kbach/react (see @kbach/react/babel). Kept as a re-export so an existing
// babel.config.js referencing '@kbach/native/babel' directly keeps working
// with zero edits.
module.exports = require('@kbach/react/babel');
