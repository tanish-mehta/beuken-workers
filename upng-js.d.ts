declare module 'upng-js' {
	interface UPNGImage {
		width: number;
		height: number;
		depth: number;
		ctype: number;
		frames: any[];
		tabs: { [key: string]: any };
	}

	function decode(buffer: ArrayBuffer): UPNGImage;
	function toRGBA8(img: UPNGImage): ArrayBuffer[];
	function encode(imgs: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer;

	export default {
		decode,
		toRGBA8,
		encode,
	};
}
