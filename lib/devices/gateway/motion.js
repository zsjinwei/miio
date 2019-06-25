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

	propertyUpdated(key, value, oldValue) {
		if (key === 'motion_status') {
			const isMotion = value === 'motion';
			if (isMotion) {
				this.updateMotion(true, '2m');
				this.initInactivityTimer();
			} else {
				this.updateMotion(false);
			}
		}

		super.propertyUpdated(key, value, oldValue);
	}

	initInactivityTimer() {
		if (this.inactivityTimer) {
			clearTimeout(this.inactivityTimer);
		}

		this.inactivityTimer = setTimeout(() => {
			this.setProperty('motion_status', 'no_motion');
		}, 2 * 60 * 1000);
	}

	// _report(data) {
	// 	super._report(data);

	// 	if (typeof data.status !== 'undefined' && data.status === 'motion') {
	// 		this.updateMotion(true, '1m');
	// 	}
	// }
};
