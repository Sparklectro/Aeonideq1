"""Kumanda için küçük PTY köprüsü (node-pty'nin derlenemediği Termux/Android için).

Kullanım: python3 pty-helper.py COLS ROWS KABUK [ARGÜMANLAR...]
  fd 0  -> terminal girdisi
  fd 1  <- terminal çıktısı
  fd 3  -> boyut komutları, her satır: "SÜTUN SATIR"
"""
import errno
import fcntl
import os
import select
import signal
import struct
import sys
import termios


def set_size(fd, cols, rows):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))


def main():
    cols, rows, argv = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3:]
    pid, master = os.forkpty()
    if pid == 0:
        os.execvp(argv[0], argv)
    set_size(master, cols, rows)

    try:
        ctl = 3
        os.fstat(ctl)
    except OSError:
        ctl = None

    def forward(signum, _frame):
        try:
            os.kill(pid, signum)
        except OSError:
            pass

    for s in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(s, forward)

    inputs = [0, master] + ([ctl] if ctl is not None else [])
    ctl_buf = b""
    while True:
        try:
            ready, _, _ = select.select(inputs, [], [])
        except InterruptedError:
            continue
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError as e:
                if e.errno == errno.EIO:  # kabuk kapandı
                    break
                raise
            if not data:
                break
            os.write(1, data)
        if 0 in ready:
            data = os.read(0, 65536)
            if not data:
                inputs.remove(0)
            else:
                os.write(master, data)
        if ctl is not None and ctl in ready:
            data = os.read(ctl, 4096)
            if not data:
                inputs.remove(ctl)
                ctl = None
            else:
                ctl_buf += data
                while b"\n" in ctl_buf:
                    line, ctl_buf = ctl_buf.split(b"\n", 1)
                    try:
                        c, r = (int(x) for x in line.split())
                        set_size(master, c, r)  # kabuğa SIGWINCH'i çekirdek gönderir
                    except (ValueError, OSError):
                        pass

    _, status = os.waitpid(pid, 0)
    sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else status >> 8)


if __name__ == "__main__":
    main()
