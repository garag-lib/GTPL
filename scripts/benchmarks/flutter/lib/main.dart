import 'dart:js_interop';
import 'dart:math' as math;
import 'package:flutter/widgets.dart';

@JS('flutterGridApi')
external set gridApi(JSObject value);

extension type GridApi._(JSObject _) implements JSObject {
  external factory GridApi({JSFunction mount, JSFunction update,
    JSFunction snapshot, JSFunction destroy});
}

final models = <ValueNotifier<int>>[];
// Recorded by each cell's builder, rather than echoing the input model.
final rendered = <int>[];
const palette = [0xffd8f36a, 0xffc6e8a0, 0xff98d4a1, 0xff6dbbb3,
  0xff94bfde, 0xffa1abe0, 0xffbca3d9, 0xffdda9cf, 0xffe7c6a4, 0xffe4df98];

Future<void> destroy() async {
  runApp(const SizedBox.shrink());
  await WidgetsBinding.instance.endOfFrame;
  for (final model in models) { model.dispose(); }
  models.clear();
  rendered.clear();
}

Future<void> mount(int columns, int rows) async {
  for (var i = 0; i < columns * rows; i++) {
    models.add(ValueNotifier(0));
    rendered.add(-1);
  }
  runApp(Directionality(textDirection: TextDirection.ltr,
    child: ColoredBox(color: const Color(0xff14291f),
      child: Column(children: [
        for (var row = 0; row < rows; row++) ...[
          if (row > 0) const SizedBox(height: 1),
          Expanded(child: Row(children: [
            for (var col = 0; col < columns; col++) ...[
              if (col > 0) const SizedBox(width: 1),
              Expanded(child: GridCell(id: row * columns + col, rows: rows)),
            ],
          ])),
        ],
      ]))));
  await WidgetsBinding.instance.endOfFrame;
}

class GridCell extends StatelessWidget {
  const GridCell({super.key, required this.id, required this.rows});
  final int id;
  final int rows;
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<int>(
    valueListenable: models[id],
    builder: (context, value, child) {
      rendered[id] = value;
      return ClipRect(child: ColoredBox(color: Color(palette[value % 10]),
        child: Center(child: Text('$value', maxLines: 1, softWrap: false,
          overflow: TextOverflow.clip,
          style: TextStyle(fontFamily: 'BenchmarkMono', fontWeight: FontWeight.w500,
            fontSize: math.min(10.0, 145 / rows), height: 1,
            color: const Color(0xff132218))))));
    },
  );
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  gridApi = GridApi(
    mount: ((JSNumber columns, JSNumber rows) =>
      mount(columns.toDartInt, rows.toDartInt).toJS).toJS,
    update: ((JSUint32Array indices, JSUint32Array values) {
      final ids = indices.toDart, next = values.toDart;
      for (var i = 0; i < ids.length; i++) { models[ids[i]].value = next[i]; }
      return WidgetsBinding.instance.endOfFrame.toJS;
    }).toJS,
    snapshot: ((JSUint32Array? indices) =>
      (indices == null ? rendered : [for (final id in indices.toDart) rendered[id]])
        .map((value) => value.toJS).toList().toJS).toJS,
    destroy: (() => destroy().toJS).toJS,
  );
}
