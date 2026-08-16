## 0.1.1-alpha.6

Measuring a workspace was doing twice the work it needed to. It walked each
project whole for its total, then walked every artifact directory again for its
own figure — and in a typical project those directories are ninety-eight per
cent of the files. They are now read once. On Windows, where a real-time
scanner inspects every file as it is opened, that is the difference between
seconds and minutes.

The scan screen also stopped freezing. The number it showed came from the
directory walk, which finishes long before the measuring does, so it sat still
under the word "Measuring" while the disk was at its busiest. It now counts
what is actually being measured.
