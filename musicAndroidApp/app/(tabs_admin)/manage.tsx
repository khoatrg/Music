import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  Image,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  RefreshControl,
  ScrollView,
  Platform,
  Dimensions,
  Animated,
} from "react-native";
import {
  collection,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import axios from "axios";
import { COLORS } from "../constants/theme";
import { Picker } from "@react-native-picker/picker";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useAlert } from "../context/alertContext";

const { width, height } = Dimensions.get("window");
const NOTCH_HEIGHT = Platform.OS === "ios" ? 47 : 24;

interface Song {
  id: string;
  name: string;
  artist?: string;
  album?: string;
  genre?: string;
  img?: string;
  audio?: string;
  views?: number;
  releaseYear?: string;
  [key: string]: any;
}

const formatViewCount = (views: number): string => {
  if (!views && views !== 0) return "0";

  if (views >= 1_000_000_000) {
    return (views / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  } else if (views >= 1_000_000) {
    return (views / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  } else if (views >= 1_000) {
    return (views / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  } else {
    return views.toString();
  }
};

export default function Manage() {
  const { confirm, success, error } = useAlert();
  const [songs, setSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingSong, setEditingSong] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isModalProcessing, setIsModalProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [newName, setNewName] = useState("");
  const [newAudio, setNewAudio] = useState("");
  const [newArtist, setNewArtist] = useState("");
  const [newAlbum, setNewAlbum] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [newReleaseYear, setNewReleaseYear] = useState("");
  const [newImg, setNewImg] = useState("");
  const [newImgUri, setNewImgUri] = useState<string | null>(null);
  const [newFileUri, setNewFileUri] = useState<string | null>(null);
  const [newFileInfo, setNewFileInfo] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [selectedSongForAction, setSelectedSongForAction] =
    useState<Song | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedSongForMenu, setSelectedSongForMenu] = useState<any | null>(
    null
  );
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const menuAnimation = useRef(new Animated.Value(0)).current;

  // Fetch songs with optional sorting
  const fetchSongs = async () => {
    setLoading(true);
    try {
      let songsQuery;
      if (sortBy) {
        songsQuery = query(collection(db, "song"), orderBy(sortBy));
      } else {
        songsQuery = collection(db, "song");
      }

      const snapshot = await getDocs(songsQuery);
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setSongs(data);
    } catch (err) {
      console.error("Lỗi khi load dữ liệu:", err);
      error("Lỗi", "Không thể tải danh sách bài hát. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSongs();
  }, []);

  useEffect(() => {
    fetchSongs();
  }, [sortBy]);

  const filteredSongs = songs.filter(
    (song) =>
      song.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (song.artist &&
        song.artist.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (song.album &&
        song.album.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const startEditing = (song: any) => {
    setEditingSong(song);
    setNewName(song.name || "");
    setNewAudio(song.audio || "");
    setNewArtist(song.artist || "");
    setNewAlbum(song.album || "");
    setNewGenre(song.genre || "");
    setNewReleaseYear(song.releaseYear || "");
    setNewImg(song.img || "");
    setNewImgUri(null);
    setNewFileUri(null);
    setNewFileInfo(null);
    setShowEditModal(true);
  };

  // Audio file picker handler
  const handlePickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["audio/mpeg", "audio/mp3", "audio/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];

        if (file.size && file.size > 50 * 1024 * 1024) {
          error("Lỗi", "File audio quá lớn. Vui lòng chọn file nhỏ hơn 50MB.");
          return;
        }

        setNewFileUri(file.uri);

        if (file.size) {
          const fileSizeInMB = (file.size / (1024 * 1024)).toFixed(2);
          setNewFileInfo(`${file.name} (${fileSizeInMB} MB)`);
        } else {
          setNewFileInfo(file.name);
        }
      }
    } catch (err) {
      console.error("Lỗi khi chọn file audio:", err);
      error("Lỗi", "Không thể chọn file audio.");
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];

        if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
          error(
            "Lỗi",
            "Hình ảnh quá lớn. Vui lòng chọn hình ảnh nhỏ hơn 10MB."
          );
          return;
        }

        setNewImgUri(asset.uri);
      }
    } catch (err) {
      console.error("Lỗi khi chọn hình ảnh:", err);
      error("Lỗi", "Không thể chọn hình ảnh.");
    }
  };

  // Save edit handler
  const saveEdit = async () => {
    if (!editingSong || !newName) {
      error("Lỗi", "Tên bài hát không được để trống");
      return;
    }

    setIsModalProcessing(true);
    setUploadProgress(0);

    try {
      let uploadedAudioUrl = newAudio;
      let uploadedImgUrl = newImg;

      if (newFileUri) {
        try {
          const formData = new FormData();
          const safeFileName = newName.replace(/[^a-zA-Z0-9_\-]/g, "_");
          const timestamp = Date.now();
          const fileExtension =
            newFileUri.split(".").pop()?.toLowerCase() || "mp3";

          formData.append("file", {
            uri: newFileUri,
            type: `audio/${fileExtension === "mp3" ? "mpeg" : fileExtension}`,
            name: `${safeFileName}_${timestamp}.${fileExtension}`,
          } as any);

          formData.append("upload_preset", "mp3_unsigned");
          formData.append("resource_type", "auto");
          formData.append("quality", "auto:good");
          formData.append("fetch_format", "auto");

          const response = await axios.post(
            "https://api.cloudinary.com/v1_1/dfn3a005q/upload",
            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
              },
              onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                  const percentCompleted = Math.round(
                    (progressEvent.loaded * 50) / progressEvent.total
                  );
                  setUploadProgress(percentCompleted);
                }
              },
              timeout: 120000,
            }
          );

          uploadedAudioUrl = response.data.secure_url;
        } catch (audioError) {
          console.error("Audio upload error:", audioError);
          throw new Error(
            "Không thể tải lên file audio. Vui lòng kiểm tra định dạng file."
          );
        }
      }

      if (newImgUri) {
        try {
          setUploadProgress(newFileUri ? 50 : 0);

          const formData = new FormData();
          const safeFileName = newName.replace(/[^a-zA-Z0-9_\-]/g, "_");
          const timestamp = Date.now();
          const fileExtension =
            newImgUri.split(".").pop()?.toLowerCase() || "jpg";

          const imageFile = {
            uri: newImgUri,
            type: `image/${fileExtension === "jpg" ? "jpeg" : fileExtension}`,
            name: `${safeFileName}_cover_${timestamp}.${fileExtension}`,
          };

          formData.append("file", imageFile as any);
          formData.append("upload_preset", "mp3_unsigned");
          formData.append("resource_type", "image");

          const response = await axios.post(
            "https://api.cloudinary.com/v1_1/dfn3a005q/upload",
            formData,
            {
              headers: {
                "Content-Type": "multipart/form-data",
              },
              onUploadProgress: (progressEvent) => {
                if (progressEvent.total) {
                  const baseProgress = newFileUri ? 50 : 0;
                  const percentCompleted = Math.round(
                    baseProgress +
                      (progressEvent.loaded * (100 - baseProgress)) /
                        progressEvent.total
                  );
                  setUploadProgress(percentCompleted);
                }
              },
              timeout: 60000,
            }
          );

          uploadedImgUrl = response.data.secure_url;
        } catch (imageError) {
          console.error("Image upload error:", imageError);

          if (axios.isAxiosError(imageError)) {
            if (imageError.response?.status === 400) {
              const errorData = imageError.response.data;
              if (errorData && errorData.error && errorData.error.message) {
                throw new Error(
                  `Lỗi upload hình ảnh: ${errorData.error.message}`
                );
              } else {
                throw new Error(
                  "Lỗi định dạng hình ảnh hoặc cấu hình upload preset."
                );
              }
            } else if (imageError.response?.status === 401) {
              throw new Error(
                "Lỗi xác thực. Vui lòng kiểm tra cấu hình Cloudinary."
              );
            } else if (imageError.response?.status === 413) {
              throw new Error(
                "Hình ảnh quá lớn. Vui lòng chọn hình ảnh nhỏ hơn."
              );
            }
          }

          throw new Error("Không thể tải lên hình ảnh. Vui lòng thử lại.");
        }
      }

      // Prepare updated data
      const updatedData: any = {};
      if (newName.trim()) updatedData.name = newName.trim();
      if (uploadedAudioUrl && uploadedAudioUrl !== newAudio)
        updatedData.audio = uploadedAudioUrl;
      if (newArtist.trim()) updatedData.artist = newArtist.trim();
      if (newAlbum.trim()) updatedData.album = newAlbum.trim();
      if (newGenre) updatedData.genre = newGenre;
      if (newReleaseYear.trim())
        updatedData.releaseYear = newReleaseYear.trim();
      if (uploadedImgUrl && uploadedImgUrl !== newImg)
        updatedData.img = uploadedImgUrl;

      // Add updatedAt timestamp
      updatedData.updatedAt = new Date();

      // Update Firestore
      await updateDoc(doc(db, "song", editingSong.id), updatedData);

      // Update local state
      setSongs(
        songs.map((song) =>
          song.id === editingSong.id ? { ...song, ...updatedData } : song
        )
      );

      // Reset form and show success message
      resetEditForm();
      success("Thành công", "Bài hát đã được cập nhật!");
    } catch (err) {
      console.error("Lỗi khi chỉnh sửa bài hát:", err);

      let errorMessage = "Không thể cập nhật bài hát. Vui lòng thử lại.";

      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (axios.isAxiosError(err)) {
        if (err.response?.status === 400) {
          errorMessage =
            "Lỗi định dạng file hoặc cấu hình tải lên. Vui lòng kiểm tra file và thử lại.";
        } else if (err.response?.status === 413) {
          errorMessage = "File quá lớn. Vui lòng chọn file nhỏ hơn.";
        } else if (err.code === "ECONNABORTED") {
          errorMessage =
            "Quá thời gian tải lên. Vui lòng kiểm tra kết nối mạng.";
        }
      }

      error("Lỗi", errorMessage);
    } finally {
      setIsModalProcessing(false);
      setUploadProgress(0);
    }
  };

  // Reset edit form
  const resetEditForm = () => {
    setEditingSong(null);
    setNewName("");
    setNewAudio("");
    setNewArtist("");
    setNewAlbum("");
    setNewGenre("");
    setNewReleaseYear("");
    setNewImg("");
    setNewFileUri(null);
    setNewImgUri(null);
    setNewFileInfo(null);
    setShowEditModal(false);
  };

  // Song item renderer
  const renderSongItem = ({ item }: { item: Song }) => {
    return (
      <TouchableOpacity
        style={styles.songItem}
        activeOpacity={0.7}
        onPress={() => startEditing(item)}
      >
        <Image
          source={{ uri: item.img }}
          style={styles.songImage}
          defaultSource={require("../../assets/images/coverImg.jpg")}
        />

        <View style={styles.songDetails}>
          <Text style={styles.songName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.songArtist} numberOfLines={1}>
            {item.artist || "Unknown Artist"}
          </Text>
          <View style={styles.songMeta}>
            <Text style={styles.songGenre}>
              {item.genre || "Unknown Genre"}
            </Text>
            {item.views !== undefined && (
              <View style={styles.viewsContainer}>
                <Icon
                  name="visibility"
                  size={14}
                  color={COLORS.textSecondary}
                />
                <Text style={styles.songViews}>
                  {formatViewCount(item.views)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.moreButton}
          onPress={(e) => {
            e.stopPropagation();
            showSongOptions(item);
          }}
        >
          <Icon name="more-vert" size={24} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Show song options
  const showSongOptions = (item: Song) => {
    setSelectedSongForAction(item);
    setShowActionSheet(true);
  };

  // Confirm delete
  const confirmDelete = (item: Song) => {
    confirm(
      "Xác nhận xóa",
      `Bạn có chắc muốn xóa bài hát "${item.name}"?`,
      () => {
        performDelete(item.id, item.name);
      }
    );
  };

  // Perform delete
  const performDelete = async (id: string, songName: string) => {
    setIsProcessing(true);
    try {
      await deleteDoc(doc(db, "song", id));
      setSongs(songs.filter((song) => song.id !== id));
      success("Thành công", "Bài hát đã được xóa!");
    } catch (err) {
      console.error("Lỗi khi xóa bài hát:", err);
      error("Lỗi", "Không thể xóa bài hát. Vui lòng thử lại.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Custom Action Sheet Component
  const CustomActionSheet = () => (
    <Modal
      visible={showActionSheet}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowActionSheet(false)}
    >
      <TouchableOpacity
        style={styles.actionSheetOverlay}
        activeOpacity={1}
        onPress={() => setShowActionSheet(false)}
      >
        <View style={styles.actionSheetContainer}>
          <View style={styles.actionSheetHeader}>
            <Text style={styles.actionSheetTitle}>
              {selectedSongForAction?.name}
            </Text>
            <Text style={styles.actionSheetSubtitle}>
              {selectedSongForAction?.artist}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.actionSheetItem}
            onPress={() => {
              setShowActionSheet(false);
              if (selectedSongForAction) {
                startEditing(selectedSongForAction);
              }
            }}
          >
            <Icon name="edit" size={24} color={COLORS.primary} />
            <Text style={styles.actionSheetItemText}>Chỉnh sửa</Text>
            <Icon name="chevron-right" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>

          <View style={styles.actionSheetDivider} />

          <TouchableOpacity
            style={styles.actionSheetItem}
            onPress={() => {
              setShowActionSheet(false);
              if (selectedSongForAction) {
                confirmDelete(selectedSongForAction);
              }
            }}
          >
            <Icon name="delete" size={24} color="#FF5252" />
            <Text style={[styles.actionSheetItemText, { color: "#FF5252" }]}>
              Xóa
            </Text>
            <Icon name="chevron-right" size={20} color="#FF5252" />
          </TouchableOpacity>

          <View style={styles.actionSheetDivider} />

          <TouchableOpacity
            style={styles.actionSheetItem}
            onPress={() => setShowActionSheet(false)}
          >
            <Icon name="close" size={24} color={COLORS.textSecondary} />
            <Text style={styles.actionSheetItemText}>Hủy</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: NOTCH_HEIGHT }]}>
      <View style={styles.container}>
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.title}>Quản lý bài hát</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push("../crud/addSongsAdmin")}
            activeOpacity={0.8}
          >
            <Icon name="add" size={18} color="#fff" />
            <Text style={styles.addButtonText}>Thêm bài hát</Text>
          </TouchableOpacity>
        </View>

        {/* Search and Sort Section */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBarContainer}>
            <Icon
              name="search"
              size={20}
              color={COLORS.textSecondary}
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm kiếm bài hát, nghệ sĩ..."
              placeholderTextColor={COLORS.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Icon name="close" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.sortContainer}>
            <Text style={styles.sortLabel}>Sắp xếp:</Text>
            <View style={styles.sortPickerContainer}>
              <Picker
                selectedValue={sortBy}
                onValueChange={(value) => setSortBy(value)}
                style={styles.sortPicker}
                dropdownIconColor={COLORS.text}
                itemStyle={{ height: 160 }}
              >
                <Picker.Item label="Tên" value="name" />
                <Picker.Item label="Nghệ sĩ" value="artist" />
                <Picker.Item label="Thể loại" value="genre" />
                <Picker.Item label="Lượt xem" value="views" />
              </Picker>
            </View>
          </View>
        </View>

        {/* Song List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>
              Đang tải danh sách bài hát...
            </Text>
          </View>
        ) : (
          <>
            {filteredSongs.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Icon name="music-off" size={64} color={COLORS.textSecondary} />
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? "Không tìm thấy bài hát phù hợp"
                    : "Chưa có bài hát nào"}
                </Text>
                {searchQuery && (
                  <TouchableOpacity
                    style={styles.clearSearchButton}
                    onPress={() => setSearchQuery("")}
                  >
                    <Text style={styles.clearSearchText}>Xóa tìm kiếm</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <FlatList
                data={filteredSongs}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{
                  paddingBottom: 100,
                }}
                renderItem={renderSongItem}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={[COLORS.primary]}
                    tintColor={COLORS.primary}
                  />
                }
              />
            )}
          </>
        )}

        {/* Processing Overlay */}
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <View style={styles.processingContent}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.processingText}>Đang xử lý...</Text>
            </View>
          </View>
        )}

        {/* Edit Modal */}
        <Modal
          visible={showEditModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => {
            if (!isModalProcessing) {
              setShowEditModal(false);
            }
          }}
        >
          <SafeAreaView
            style={[styles.modalSafeArea, { paddingTop: NOTCH_HEIGHT }]}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => {
                      if (!isModalProcessing) {
                        setShowEditModal(false);
                      }
                    }}
                    disabled={isModalProcessing}
                  >
                    <Icon name="close" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                  <Text style={styles.modalTitle}>Chỉnh sửa bài hát</Text>
                  <View style={{ width: 24 }} />
                </View>

                {isModalProcessing ? (
                  <View style={styles.processingModalContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.processingModalText}>
                      Đang cập nhật...
                    </Text>

                    <View style={styles.progressContainer}>
                      <View style={styles.progressBar}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${uploadProgress}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressText}>{uploadProgress}%</Text>
                    </View>
                  </View>
                ) : (
                  <ScrollView style={styles.modalScroll}>
                    {/* Form Preview with Song Image */}
                    <View style={styles.formPreview}>
                      <Image
                        source={{
                          uri:
                            newImgUri ||
                            newImg ||
                            "https://via.placeholder.com/150",
                        }}
                        style={styles.previewImage}
                      />
                      <View style={styles.previewOverlay}>
                        <TouchableOpacity
                          style={styles.changeImageButton}
                          onPress={handlePickImage}
                        >
                          <Icon name="camera-alt" size={24} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Form Fields */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Tên bài hát *</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="Nhập tên bài hát"
                        placeholderTextColor={COLORS.textSecondary}
                        value={newName}
                        onChangeText={setNewName}
                      />
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Nghệ sĩ</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="Nhập tên nghệ sĩ"
                        placeholderTextColor={COLORS.textSecondary}
                        value={newArtist}
                        onChangeText={setNewArtist}
                      />
                    </View>

                    <View style={styles.formRow}>
                      <View
                        style={[styles.formGroup, { flex: 1, marginRight: 8 }]}
                      >
                        <Text style={styles.formLabel}>Album</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="Nhập album"
                          placeholderTextColor={COLORS.textSecondary}
                          value={newAlbum}
                          onChangeText={setNewAlbum}
                        />
                      </View>

                      <View
                        style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}
                      >
                        <Text style={styles.formLabel}>Năm phát hành</Text>
                        <TextInput
                          style={styles.formInput}
                          placeholder="Năm phát hành"
                          placeholderTextColor={COLORS.textSecondary}
                          value={newReleaseYear}
                          onChangeText={setNewReleaseYear}
                          keyboardType="numeric"
                          maxLength={4}
                        />
                      </View>
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Thể loại</Text>
                      <View style={styles.genrePickerContainer}>
                        <Picker
                          selectedValue={newGenre}
                          onValueChange={(value) => setNewGenre(value)}
                          style={styles.genrePicker}
                          itemStyle={{ height: 160 }}
                        >
                          <Picker.Item label="Chọn thể loại" value="" />
                          <Picker.Item label="Rap" value="Rap" />
                          <Picker.Item label="Ballad" value="Ballad" />
                          <Picker.Item label="Pop" value="Pop" />
                          <Picker.Item label="Rock" value="Rock" />
                          <Picker.Item label="Jazz" value="Jazz" />
                          <Picker.Item label="EDM" value="EDM" />
                        </Picker>
                      </View>
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>File nhạc</Text>
                      <TouchableOpacity
                        style={styles.filePicker}
                        onPress={handlePickAudio}
                      >
                        <Icon
                          name="music-note"
                          size={20}
                          color={COLORS.primary}
                        />
                        <Text style={styles.filePickerText}>
                          {newFileInfo
                            ? newFileInfo
                            : "Chọn file MP3 mới (tùy chọn)"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Buttons */}
                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={() => setShowEditModal(false)}
                      >
                        <Text style={styles.cancelButtonText}>Hủy</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.saveButton,
                          !newName.trim() && styles.disabledButton,
                        ]}
                        onPress={saveEdit}
                        disabled={!newName.trim()}
                      >
                        <Text style={styles.saveButtonText}>Lưu thay đổi</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                )}
              </View>
            </View>
          </SafeAreaView>
        </Modal>

        {/* Custom Action Sheet */}
        <CustomActionSheet />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background || "#f8f8f8",
  },
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingVertical: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.text || "#000",
  },
  addButton: {
    backgroundColor: COLORS.primary || "#1DB954",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "bold",
    marginLeft: 4,
  },
  searchContainer: {
    marginBottom: 16,
  },
  searchBarContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.cardBg || "#fff",
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 48,
    color: COLORS.text || "#000",
    fontSize: 16,
  },
  sortContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  sortLabel: {
    fontSize: 16,
    marginRight: 8,
    color: COLORS.text || "#000",
  },
  sortPickerContainer: {
    flex: 1,
    backgroundColor: COLORS.cardBg || "#fff",
    borderRadius: 8,
    height: Platform.OS === "ios" ? 45 : 50,
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: Platform.OS === "ios" ? 8 : 0,
  },
  sortPicker: {
    height: Platform.OS === "ios" ? 45 : 50,
    width: Platform.OS === "android" ? "100%" : undefined,
    color: COLORS.text || "#000",

    ...(Platform.OS === "android" ? { marginLeft: -8 } : {}),
  },
  listContainer: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.text || "#000",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: COLORS.textSecondary || "#666",
    marginTop: 16,
    textAlign: "center",
  },
  clearSearchButton: {
    marginTop: 16,
    padding: 8,
    backgroundColor: COLORS.cardBg || "#f0f0f0",
    borderRadius: 8,
  },
  clearSearchText: {
    color: COLORS.primary || "#1DB954",
    fontWeight: "500",
  },
  songItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.cardBg || "#fff",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  songImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 12,
  },
  songDetails: {
    flex: 1,
    justifyContent: "center",
  },
  songName: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
    color: COLORS.text || "#000",
  },
  songArtist: {
    fontSize: 14,
    color: COLORS.textSecondary || "#666",
    marginBottom: 4,
  },
  songMeta: {
    flexDirection: "row",
    alignItems: "center",
  },
  songGenre: {
    fontSize: 12,
    color: COLORS.textSecondary || "#666",
    backgroundColor: COLORS.hoverBg || "#f0f0f0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  viewsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  songViews: {
    fontSize: 12,
    color: COLORS.textSecondary || "#666",
    marginLeft: 4,
  },
  actions: {
    flexDirection: "column",
    justifyContent: "space-between",
    height: 64,
  },
  moreButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  editButton: {
    backgroundColor: COLORS.primary || "#1DB954",
  },
  deleteButton: {
    backgroundColor: "#FF5252",
  },
  processingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  processingContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
    width: width * 0.7,
  },
  processingText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.text || "#000",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 20,
  },
  modalContent: {
    width: "90%",
    backgroundColor: COLORS.background || "#fff",
    borderRadius: 12,
    maxHeight: "85%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hoverBg || "#f0f0f0",
  },
  closeButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.text || "#000",
  },
  modalScroll: {
    padding: 16,
  },
  formPreview: {
    alignItems: "center",
    marginBottom: 24,
    position: "relative",
    marginTop: 10,
  },
  previewImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.hoverBg || "#f0f0f0",
  },
  previewOverlay: {
    position: "absolute",
    bottom: 0,
    right: 0,
    transform: [{ translateX: -30 }],
  },
  changeImageButton: {
    backgroundColor: COLORS.primary || "#1DB954",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: COLORS.background || "#fff",
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 16,
    marginBottom: 8,
    color: COLORS.text || "#000",
    fontWeight: "500",
  },
  formInput: {
    backgroundColor: COLORS.cardBg || "#fff",
    borderWidth: 1,
    borderColor: COLORS.hoverBg || "#f0f0f0",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: COLORS.text || "#000",
  },
  genrePickerContainer: {
    backgroundColor: COLORS.cardBg || "#fff",
    borderWidth: 1,
    borderColor: COLORS.hoverBg || "#f0f0f0",
    borderRadius: 8,
    height: Platform.OS === "ios" ? 45 : 50, // Tăng chiều cao cho Android
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: Platform.OS === "ios" ? 8 : 0,
  },
  genrePicker: {
    height: Platform.OS === "ios" ? 45 : 50, // Khớp với container
    width: Platform.OS === "android" ? "100%" : undefined, // Sửa width cho Android
    color: COLORS.text || "#000",
    // Loại bỏ padding không cần thiết trên Android
    ...(Platform.OS === "android" ? { marginLeft: -8 } : {}), // Điều chỉnh vị trí cho Android
  },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.cardBg || "#fff",
    borderWidth: 1,
    borderColor: COLORS.hoverBg || "#f0f0f0",
    borderRadius: 8,
    padding: 12,
  },
  filePickerText: {
    marginLeft: 8,
    fontSize: 16,
    color: COLORS.text || "#000",
  },
  modalActions: {
    flexDirection: "row",
    marginTop: 24,
    marginBottom: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.cardBg || "#f0f0f0",
    paddingVertical: 14,
    borderRadius: 8,
    marginRight: 8,
    alignItems: "center",
  },
  cancelButtonText: {
    color: COLORS.text || "#000",
    fontWeight: "bold",
    fontSize: 16,
  },
  saveButton: {
    flex: 2,
    backgroundColor: COLORS.primary || "#1DB954",
    paddingVertical: 14,
    borderRadius: 8,
    marginLeft: 8,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  processingModalContainer: {
    padding: 24,
    alignItems: "center",
  },
  processingModalText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.text || "#000",
    marginBottom: 16,
  },
  progressContainer: {
    width: "100%",
    marginTop: 8,
  },
  progressBar: {
    width: "100%",
    height: 8,
    backgroundColor: COLORS.hoverBg || "#f0f0f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary || "#1DB954",
  },
  progressText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textSecondary || "#666",
    textAlign: "center",
  },

  // Thêm style cho menu
  menuOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    zIndex: 1000,
  },
  actionMenu: {
    position: "absolute",
    width: 150,
    backgroundColor: COLORS.cardBg || "#fff",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1001,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  menuItemText: {
    marginLeft: 10,
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.text || "#000",
  },
  menuDivider: {
    height: 1,
    backgroundColor: COLORS.hoverBg || "#f0f0f0",
  },

  // Thêm style cho action sheet
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  actionSheetContainer: {
    backgroundColor: COLORS.cardBg || "#fff",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    paddingBottom: 32,
    paddingTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  actionSheetHeader: {
    alignItems: "center",
    marginBottom: 16,
  },
  actionSheetTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.text || "#000",
  },
  actionSheetSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary || "#666",
  },
  actionSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  actionSheetItemText: {
    marginLeft: 12,
    fontSize: 16,
    color: COLORS.text || "#000",
  },
  actionSheetDivider: {
    height: 1,
    backgroundColor: COLORS.hoverBg || "#f0f0f0",
    marginVertical: 8,
  },
});
