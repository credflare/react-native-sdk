import AVFoundation
import ImageIO
import NitroModules
import Vision
import VisionCamera

class HybridVisionFaceDetectorFactory: HybridVisionFaceDetectorFactorySpec {
  func createOutput(options: VisionFaceOutputOptions) throws -> any HybridCameraOutputSpec {
    return HybridVisionFaceOutput(options)
  }
}

final class VisionFaceSampleDelegate: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let onFrame: (CMSampleBuffer, AVCaptureConnection) -> Void

  init(onFrame: @escaping (CMSampleBuffer, AVCaptureConnection) -> Void) {
    self.onFrame = onFrame
    super.init()
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    onFrame(sampleBuffer, connection)
  }
}

class HybridVisionFaceOutput: HybridCameraOutputSpec, NativeCameraOutput {
  private let queue = DispatchQueue(label: "CredflareVisionFaceQueue")
  private let onReading: (VisionFaceReading) -> Void
  private let onError: (Error) -> Void
  private var delegate: VisionFaceSampleDelegate?
  let output = AVCaptureVideoDataOutput()
  let requiresAudioInput = false
  let requiresDepthFormat = false
  let mediaType: MediaType = .video
  let streamType: StreamType = .video
  var outputOrientation: CameraOrientation = .up
  var currentResolution: Size? {
    guard let connection = output.connection(with: .video) else { return nil }
    return connection.inputStreamResolution
  }
  var targetResolution: ResolutionRule { .closestTo(Size(width: 720.0, height: 1280.0)) }

  init(_ options: VisionFaceOutputOptions) {
    onReading = options.onReading
    onError = options.onError
    super.init()
    delegate = VisionFaceSampleDelegate { [weak self] buffer, connection in
      self?.detect(buffer, connection: connection)
    }
    output.setSampleBufferDelegate(delegate, queue: queue)
    output.alwaysDiscardsLateVideoFrames = true
  }

  func configure(config _: OutputConfiguration) {
    guard let connection = output.connection(with: .video) else { return }
    if #available(iOS 17.0, *) {
      if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
    } else if connection.isVideoOrientationSupported {
      connection.videoOrientation = .portrait
    }
    if connection.isVideoMirroringSupported {
      connection.automaticallyAdjustsVideoMirroring = false
      connection.isVideoMirrored = false
    }
  }

  private static func orientation(of connection: AVCaptureConnection) -> CGImagePropertyOrientation {
    var portrait: Bool
    if #available(iOS 17.0, *) {
      portrait = connection.videoRotationAngle == 90
    } else {
      portrait = connection.videoOrientation == .portrait
    }
    // An unrotated buffer is landscape and must turn a quarter clockwise to stand upright.
    return portrait ? .up : .right
  }

  private func detect(_ buffer: CMSampleBuffer, connection: AVCaptureConnection) {
    guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { return }
    let orientation = Self.orientation(of: connection)
    let width = CGFloat(CVPixelBufferGetWidth(pixels)), height = CGFloat(CVPixelBufferGetHeight(pixels))
    let size = orientation == .up ? CGSize(width: width, height: height) : CGSize(width: height, height: width)
    let handler = VNImageRequestHandler(cvPixelBuffer: pixels, orientation: orientation, options: [:])
    let rectangles = VNDetectFaceRectanglesRequest()
    rectangles.revision = VNDetectFaceRectanglesRequestRevision3
    do {
      try handler.perform([rectangles])
    } catch {
      onError(error)
      return
    }
    let faces = rectangles.results ?? []
    guard faces.count == 1, let face = faces.first else {
      onReading(VisionFaceReading(faces: Double(faces.count), x: 0, y: 0, width: 0, height: 0, yaw: nil, pitch: nil, eyeRatio: nil, mouthRatio: nil))
      return
    }
    let landmarks = VNDetectFaceLandmarksRequest()
    landmarks.revision = VNDetectFaceLandmarksRequestRevision3
    landmarks.inputFaceObservations = [face]
    try? handler.perform([landmarks])
    let marks = landmarks.results?.first?.landmarks
    var eyeRatio: Double?
    if let left = marks?.leftEye?.pointsInImage(imageSize: size), let right = marks?.rightEye?.pointsInImage(imageSize: size),
       let a = Self.eyeAspectRatio(left), let b = Self.eyeAspectRatio(right) {
      eyeRatio = (a + b) / 2
    }
    var mouthRatio: Double?
    if let lips = marks?.outerLips?.pointsInImage(imageSize: size), let lp = marks?.leftPupil?.pointsInImage(imageSize: size).first,
       let rp = marks?.rightPupil?.pointsInImage(imageSize: size).first {
      mouthRatio = Self.mouthWidthRatio(lips: lips, leftPupil: lp, rightPupil: rp)
    }
    let box = face.boundingBox
    onReading(VisionFaceReading(
      faces: 1, x: Double(box.minX), y: Double(box.minY), width: Double(box.width), height: Double(box.height),
      yaw: face.yaw?.doubleValue, pitch: face.pitch?.doubleValue, eyeRatio: eyeRatio, mouthRatio: mouthRatio))
  }

  static func eyeAspectRatio(_ points: [CGPoint]) -> Double? {
    guard points.count >= 4, let minX = points.map(\.x).min(), let maxX = points.map(\.x).max(),
          let minY = points.map(\.y).min(), let maxY = points.map(\.y).max(), maxX > minX else { return nil }
    return Double((maxY - minY) / (maxX - minX))
  }

  static func mouthWidthRatio(lips: [CGPoint], leftPupil: CGPoint, rightPupil: CGPoint) -> Double? {
    guard let minX = lips.map(\.x).min(), let maxX = lips.map(\.x).max() else { return nil }
    let pupils = hypot(leftPupil.x - rightPupil.x, leftPupil.y - rightPupil.y)
    guard pupils > 0 else { return nil }
    return Double((maxX - minX) / pupils)
  }
}
