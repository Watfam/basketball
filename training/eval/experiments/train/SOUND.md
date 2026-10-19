# Louder sound

Measured offline in Chrome (`sound-e2e.mjs`), loudness as RMS of the sound against the old shot blip (a sine at 0.2 of full scale):

* Loud (the default, full scale): about 15 dB louder (roughly 5x the sound pressure). Normal is the old feel, a little louder. There was briefly a third level, Max; it was the same loudness as Loud to a listener, so it was removed (a phone that had chosen it shows Loud).
* How: a square wave (more energy, and harmonics that sit where a phone speaker is strong) at up to full scale, through one level control and a limiter set just under full scale so overlapping beeps do not clip.
* Pitches moved up: make 1400 Hz (was 1040), miss 620 Hz (was 330: nearly inaudible outdoors from a phone speaker), warning 1500 Hz, time's up 760 Hz.
* A Sound level picker (Normal, Loud) is in every Sound check and in the camera's three-dot menu, remembered on the phone; picking one plays a make and a miss.

Limit: the phone's own volume is the ceiling. A web page cannot raise it, and the silent switch is already bypassed by the playback audio session.
