'use strict';

const SubDevice = require('./subdevice');
const {
	Motion
} = require('abstract-things/sensors');
const Voltage = require('./voltage');

/**
 * Motion sensing device, emits the event `motion` whenever motion is detected.
 */
module.exports = class MotionDetector extends SubDevice.with(Motion, Voltage) {
	constructor(parent, info) {
		super(parent, info);

		this.miioModel = 'lumi.motion';

		this.defineProperty('motion_status');

		// this.updateMotion(false);
	}

	setProperty(key, value) {
		super.setProperty(key, value);

		if (key === 'motion_status') {
			const isMotion = value === 'motion';
			if (isMotion) {
				this.updateMotion(true, '90s');
				this.emitEvent('movement');
				this.startInactivityTimer();
			}
		}
	}

	propertyUpdated(key, value, oldValue) {
		if (key === 'motion_status' && typeof oldValue != 'undefined') {
			const isMotion = value === 'motion';
			if (isMotion) {
				this.updateMotion(true, '90s');
				this.startInactivityTimer();
			} else {
				this.updateMotion(false);
			}
		}

		super.propertyUpdated(key, value, oldValue);
	}

	startInactivityTimer() {
		if (this.inactivityTimer) {
			clearTimeout(this.inactivityTimer);
		}

		this.inactivityTimer = setTimeout(() => {
			this.setProperty('motion_status', 'no_motion');
		}, 90 * 1000);
	}

	_report(propData) {
		console.log(propData);

		if(propData.cmd === 'heartbeat') {
			for (let i in propData.data) {
				if(typeof propData.data[i]['battery_voltage'] != 'undefined') {
					console.log('sensor motion heartbeat, just update battery_voltage: ' + propData.data[i]['battery_voltage']);
					this.setProperty('battery_voltage', propData.data[i]['battery_voltage']);
					break;
				}
			}

			return;
		}

		super._report(propData);
	}
};
