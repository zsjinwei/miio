'use strict';

const {
	Thing,
	BatteryLevel
} = require('abstract-things');

const VOLTAGE_MIN = 2800;
const VOLTAGE_MAX = 3300;

/**
 * Mixin for subdevices that support reporting voltage and that can be
 * transformed into a battery level.
 */
module.exports = Thing.mixin(Parent => class extends Parent.with(BatteryLevel) {

	constructor(...args) {
		super(...args);

		this.defineProperty('battery_voltage', v => v / 1000.0);
	}

	propertyUpdated(key, value, oldValue) {
		if (key === 'battery_voltage' && value) {
			let level = Number((value - VOLTAGE_MIN) / (VOLTAGE_MAX - VOLTAGE_MIN) * 100.0).toFixed(2);
			if (level < 0.0) {
				level = 0.0;
			}

			this.updateBatteryLevel(level);
		}

		super.propertyUpdated(key, value, oldValue);
	}

});
