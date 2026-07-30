/**
 * SmileBASIC 4 の組み込み命令・関数。
 *
 * 出典: プチコン4 公式リファレンス（4.4.9）の各カテゴリページ
 *   https://sup4.smilebasic.com/doku.php?id=reference:top
 *
 * 予約語は keywords.ts が持つ。ここには予約語ではない組み込みの命令・関数だけを置く。
 * 命令（PRINT のように値を返さないもの）と関数（ABS() のように値を返すもの）は
 * ハイライト上の扱いが同じなので区別せず 1 つの配列にしている。
 *
 * SmileBASIC 4 に SmileBASIC 3 のようなシステム変数（MAINCNT, VERSION 等）は無く、
 * MAINCNT() や TIME$() のように括弧付きの関数になっている点に注意。
 *
 * 語を追加・修正するときはこの配列だけを直せばよい。
 * ハイライト用の TextMate 文法はここから自動生成される（tools/build-grammar.ts）。
 */
export const BUILTINS: readonly string[] = [
  'ABS', 'ACCEL', 'ACLS', 'ACOS',
  'ANIMDEF', 'ARRAY%', 'ARYOP', 'ASC',
  'ASIN', 'ATAN', 'ATR', 'ATTR',
  'BACKCOLOR', 'BACKTRACE', 'BEEP', 'BEEPPAN',
  'BEEPPIT', 'BEEPSTOP', 'BEEPVOL', 'BGMCHK',
  'BGMCLEAR', 'BGMCONT', 'BGMPAUSE', 'BGMPITCH',
  'BGMPLAY', 'BGMSET', 'BGMSETD', 'BGMSTOP',
  'BGMVAR', 'BGMVOL', 'BGMWET', 'BIN$',
  'BIQUAD', 'BQPARAM', 'BREPEAT', 'BUTTON',
  'CALLIDX', 'CEIL', 'CHKCALL', 'CHKCHR',
  'CHKFILE', 'CHKLABEL', 'CHKMML', 'CHKVAR',
  'CHR$', 'CLASSIFY', 'CLEAR', 'CLIPBOARD',
  'CLS', 'COLOR', 'CONST', 'CONT',
  'CONTROLLER', 'COPY', 'COS', 'COSH',
  'DATE$', 'DEC', 'DEFARG', 'DEFARGC',
  'DEFOUTC', 'DEG', 'DELETE', 'DIALOG',
  'DTREAD', 'EFCEN', 'EFCSET', 'EFCWET',
  'ENUM', 'ENVFOCUS', 'ENVINPUT$', 'ENVLOAD',
  'ENVPROJECT', 'ENVSAVE', 'ENVSTAT', 'ENVTYPE',
  'EXP', 'FADE', 'FADECHK', 'FFT',
  'FFTWFN', 'FILES', 'FILL', 'FIND',
  'FLOAT', 'FLOOR', 'FONTINFO', 'FORMAT$',
  'FREEMEM', 'GARRAY', 'GBOX', 'GCIRCLE',
  'GCLIP', 'GCLS', 'GCOLOR', 'GCOPY',
  'GFILL', 'GLINE', 'GLOAD', 'GPAINT',
  'GPGET', 'GPSET', 'GPUTCHR', 'GPUTCHRP',
  'GSAMPLE', 'GSAVE', 'GTARGET', 'GTRI',
  'GUPDATE', 'GYROA', 'GYROSYNC', 'GYROV',
  'HELPGET', 'HELPINFO', 'HEX$', 'HSV',
  'HSVF', 'IFFT', 'INC', 'INKEY$',
  'INSERT', 'INSPECT', 'INSTR', 'INT',
  'IRREAD', 'IRSPRITE', 'IRSTART', 'IRSTATE',
  'IRSTOP', 'KEY', 'KEYBOARD', 'LAST',
  'LAYER', 'LCLIP', 'LEFT$', 'LEN',
  'LFILTER', 'LIST', 'LMATRIX', 'LOAD',
  'LOADG', 'LOADV', 'LOCATE', 'LOG',
  'MAINCNT', 'MAX', 'MBUTTON', 'METAEDIT',
  'METALOAD', 'METASAVE', 'MID$', 'MILLISEC',
  'MIN', 'MOUSE', 'NEW', 'OPTION',
  'PCMCONT', 'PCMPOS', 'PCMSTOP', 'PCMSTREAM',
  'PCMVOL', 'PERFBEGIN', 'PERFEND', 'POP',
  'POW', 'PRGDEL', 'PRGEDIT', 'PRGGET$',
  'PRGINS', 'PRGNAME$', 'PRGSEEK', 'PRGSET',
  'PRGSIZE', 'PROJECT', 'PUSH', 'PUSHKEY',
  'RAD', 'RANDOMIZE', 'RECCHK', 'RECDATA',
  'RECLEN', 'RECPOS', 'RECSAVE', 'RECSTART',
  'RECSTOP', 'REMOVE', 'RENAME', 'RESIZE',
  'RESULT', 'RGB', 'RGBF', 'RIGHT$',
  'RINGCOPY', 'RND', 'RNDF', 'ROUND',
  'RSORT', 'RUN', 'SAVE', 'SAVEG',
  'SAVEV', 'SCROLL', 'SGN', 'SHIFT',
  'SIN', 'SINH', 'SNDMSBAL', 'SNDMVOL',
  'SNDSTOP', 'SORT', 'SPANIM', 'SPCHK',
  'SPCHR', 'SPCLR', 'SPCOL', 'SPCOLOR',
  'SPCOLVEC', 'SPDEF', 'SPFUNC', 'SPHIDE',
  'SPHITINFO', 'SPHITRC', 'SPHITSP', 'SPHOME',
  'SPLAYER', 'SPLINK', 'SPOFS', 'SPPAGE',
  'SPROT', 'SPSCALE', 'SPSET', 'SPSHOW',
  'SPSTART', 'SPSTOP', 'SPUNLINK', 'SPUSED',
  'SPVAR', 'SQR', 'STICK', 'STOP',
  'STR$', 'SUBHIDE', 'SUBRUN', 'SUBSHOW',
  'SUBST$', 'SUBSTOP', 'SYSPARAM', 'TALK',
  'TALKCHK', 'TALKSTOP', 'TAN', 'TANH',
  'TANIM', 'TARRAY', 'TBLEND', 'TCBIKE',
  'TCCAR', 'TCFISHING', 'TCHK', 'TCHOUSE',
  'TCOLOR', 'TCOORD', 'TCOPY', 'TCPIANO',
  'TCPLANE', 'TCROBOT', 'TCSUBM', 'TCVEHICLE',
  'TCVISOR', 'TFILL', 'TFUNC', 'THIDE',
  'THOME', 'TIME$', 'TLAYER', 'TLOAD',
  'TMREAD', 'TOFS', 'TOUCH', 'TPAGE',
  'TPUT', 'TRACE', 'TROT', 'TSAVE',
  'TSCALE', 'TSCREEN', 'TSHOW', 'TSTART',
  'TSTOP', 'TUPDATE', 'TVAR', 'TYPEOF',
  'UNSHIFT', 'VAL', 'VIBRATE', 'VSYNC',
  'WAIT', 'WAVSET', 'WAVSETA', 'XCTRLSTYLE',
  'XSCREEN', 'XSUBSCREEN',
];

/** BUILTINS の高速な検索用。大文字表記で保持する。 */
const BUILTIN_SET: ReadonlySet<string> = new Set(BUILTINS);

/**
 * 大文字化した綴りが組み込み命令・関数なら true。
 * SmileBASIC の識別子は大文字小文字を区別しない。
 */
export function isBuiltin(text: string): boolean {
  return BUILTIN_SET.has(text.toUpperCase());
}
